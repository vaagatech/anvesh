/**
 * Anvesh Engine — orchestrates inverted index + vector store per named index.
 */

import { randomUUID } from "node:crypto";
import { InvertedIndex, type InvertedIndexSnapshot } from "./inverted-index.js";
import { VectorStore, type VectorStoreSnapshot } from "./vector-store.js";
import { blendScores, reciprocalRankFusion } from "./hybrid.js";
import { assertGeoPoint, distanceFromOrigin, validateGeoQuery } from "./geo.js";
import { localEmbed, textFromFields, meaningfulVectorHits } from "./embed.js";
import { globalCircuits } from "./circuit.js";
import {
  coerceDocumentFields,
  expandMappingsFromFields,
} from "./dynamic-mapping.js";
import { AnveshError, formatMessage } from "../messaging/vaakly.js";
import type { StorageAdapter } from "../storage/types.js";
import type {
  AnveshDocument,
  BulkIndexItem,
  BulkIndexResult,
  DocumentId,
  FieldMapping,
  IndexDefinition,
  IndexSettings,
  SearchQuery,
  SearchResult,
  JsonValue,
} from "../types.js";

export interface IndexState {
  definition: IndexDefinition;
  inverted: InvertedIndex;
  vectors: VectorStore | null;
}

export interface PersistedIndex {
  definition: IndexDefinition;
  inverted: InvertedIndexSnapshot;
  vectors: VectorStoreSnapshot | null;
}

export class AnveshEngine {
  private indexes = new Map<string, IndexState>();
  private dirty = new Set<string>();
  private aliases = new Map<string, string>();
  private queryCache = new Map<string, Map<string, SearchResult>>();

  constructor(private readonly storage: StorageAdapter) {}

  async init(): Promise<void> {
    const names = await this.storage.listIndexes();
    for (const name of names) {
      const raw = await this.storage.loadIndex(name);
      if (!raw) continue;
      this.indexes.set(name, this.hydrate(raw));
    }
  }

  private hydrate(raw: PersistedIndex): IndexState {
    const inverted = InvertedIndex.fromSnapshot(
      raw.inverted,
      raw.definition.mappings,
      raw.definition.settings ?? {},
    );
    const settings = raw.definition.settings;
    const vectors =
      raw.vectors && settings?.vectorDimensions
        ? VectorStore.fromSnapshot(raw.vectors)
        : settings?.vectorDimensions
          ? new VectorStore(
              settings.vectorDimensions,
              settings.vectorMetric ?? "cosine",
              settings.vectorIndexType ?? "flat",
              settings.vectorQuantization ?? "none",
            )
          : null;
    return { definition: raw.definition, inverted, vectors };
  }

  private persistPayload(state: IndexState): PersistedIndex {
    return {
      definition: {
        ...state.definition,
        docCount: state.inverted.docCount,
        updatedAt: new Date().toISOString(),
      },
      inverted: state.inverted.toSnapshot(),
      vectors: state.vectors?.toSnapshot() ?? null,
    };
  }

  async flush(name?: string): Promise<void> {
    const targets = name ? [name] : [...this.dirty];
    for (const n of targets) {
      const state = this.indexes.get(n);
      if (!state) continue;
      try {
        await this.storage.saveIndex(n, this.persistPayload(state));
        this.dirty.delete(n);
      } catch (err) {
        throw new AnveshError("ERR_STORAGE", {
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private markDirty(name: string): void {
    this.dirty.add(name);
    this.queryCache.delete(name);
  }

  listIndexes(): IndexDefinition[] {
    return [...this.indexes.values()].map((s) => ({
      ...s.definition,
      docCount: s.inverted.docCount,
    }));
  }

  getIndex(name: string): IndexDefinition {
    const state = this.require(name);
    return { ...state.definition, docCount: state.inverted.docCount };
  }

  hasIndex(name: string): boolean {
    const resolved = this.aliases.get(name) ?? name;
    return this.indexes.has(resolved);
  }

  async createIndex(
    name: string,
    mappings: Record<string, FieldMapping> = {},
    settings: IndexSettings = {},
  ): Promise<IndexDefinition> {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)) {
      throw new AnveshError("ERR_VALIDATION", {
        detail: "index name must be lowercase alphanumeric, start with a letter/number, max 64 chars",
      });
    }
    if (this.indexes.has(name)) {
      throw new AnveshError("ERR_INDEX_EXISTS", { name });
    }
    const resolvedSettings: IndexSettings = { dynamicMapping: true, ...settings };
    const now = new Date().toISOString();
    const definition: IndexDefinition = {
      name,
      mappings: { ...mappings },
      settings: resolvedSettings,
      createdAt: now,
      updatedAt: now,
      docCount: 0,
    };
    const inverted = new InvertedIndex(definition.mappings, resolvedSettings);
    const vectors = settings.vectorDimensions
      ? new VectorStore(
          settings.vectorDimensions,
          settings.vectorMetric ?? "cosine",
          settings.vectorIndexType ?? "flat",
          settings.vectorQuantization ?? "none",
        )
      : null;
    this.indexes.set(name, { definition, inverted, vectors });
    this.markDirty(name);
    await this.flush(name);
    return definition;
  }

  async deleteIndex(name: string): Promise<void> {
    this.require(name);
    this.indexes.delete(name);
    this.dirty.delete(name);
    try {
      await this.storage.deleteIndex(name);
    } catch (err) {
      throw new AnveshError("ERR_STORAGE", {
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private require(name: string): IndexState {
    const resolved = this.aliases.get(name) ?? name;
    const state = this.indexes.get(resolved);
    if (!state) throw new AnveshError("ERR_INDEX_NOT_FOUND", { name });
    return state;
  }

  listAliases(): Record<string, string> {
    return Object.fromEntries(this.aliases);
  }

  putAlias(alias: string, index: string): void {
    if (!this.indexes.has(index)) throw new AnveshError("ERR_INDEX_NOT_FOUND", { name: index });
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(alias)) {
      throw new AnveshError("ERR_VALIDATION", { detail: "invalid alias name" });
    }
    this.aliases.set(alias, index);
  }

  deleteAlias(alias: string): void {
    this.aliases.delete(alias);
  }

  suggest(
    indexName: string,
    prefix: string,
    options: { field?: string; size?: number } = {},
  ): string[] {
    const state = this.require(indexName);
    return state.inverted.suggest(prefix, options.field, options.size ?? 10);
  }

  async updateByQuery(
    indexName: string,
    body: {
      filters?: SearchQuery["filters"];
      set: Record<string, unknown>;
      maxDocs?: number;
    },
  ): Promise<{ updated: number }> {
    const state = this.require(indexName);
    const maxDocs = body.maxDocs ?? 100;
    globalCircuits.checkBulkSize(maxDocs);
    const ids = state.inverted.filterDocIds(body.filters).slice(0, maxDocs);
    let updated = 0;
    for (const id of ids) {
      const doc = state.inverted.get(id);
      if (!doc) continue;
      const fields = { ...doc.fields, ...(body.set as Record<string, JsonValue>) };
      await this.indexDocument(indexName, {
        id,
        fields,
        vector: doc.vector,
        meta: doc.meta,
      });
      updated += 1;
    }
    return { updated };
  }

  /** Validate and normalize geo_point fields to `{ lat, lon }`. */
  private normalizeFields(
    mappings: Record<string, FieldMapping>,
    fields: Record<string, JsonValue>,
  ): Record<string, JsonValue> {
    const out: Record<string, JsonValue> = { ...fields };
    for (const [field, mapping] of Object.entries(mappings)) {
      if (mapping.type !== "geo_point") continue;
      if (out[field] === undefined || out[field] === null) continue;
      const point = assertGeoPoint(out[field], field);
      out[field] = { lat: point.lat, lon: point.lon };
    }
    return out;
  }

  /**
   * Coerce values, optionally expand mappings (dynamic schema), then normalize.
   * Mutates `state.definition.mappings` when dynamicMapping is enabled.
   */
  private prepareFields(
    state: IndexState,
    fields: Record<string, JsonValue>,
  ): Record<string, JsonValue> {
    const coerced = coerceDocumentFields(fields) as Record<string, JsonValue>;
    const dynamic = state.definition.settings?.dynamicMapping !== false;
    if (dynamic) {
      expandMappingsFromFields(state.definition.mappings, coerced);
    }
    return this.normalizeFields(state.definition.mappings, coerced);
  }

  private publicDoc(doc: AnveshDocument): AnveshDocument {
    const { vector: _v, ...rest } = doc;
    return rest;
  }

  private shouldAutoEmbed(settings?: IndexSettings): boolean {
    if (!settings?.vectorDimensions) return false;
    if (settings.autoEmbed === false) return false;
    return true; // default on when vectorDimensions is set
  }

  private ensureVectorStore(state: IndexState): VectorStore {
    if (!state.vectors) {
      const s = state.definition.settings;
      const dims = s?.vectorDimensions;
      if (!dims) {
        throw new AnveshError("ERR_VALIDATION", {
          detail: "index has no vectorDimensions; set settings.vectorDimensions to enable vectors",
        });
      }
      state.vectors = new VectorStore(
        dims,
        s?.vectorMetric ?? "cosine",
        s?.vectorIndexType ?? "flat",
        s?.vectorQuantization ?? "none",
      );
    }
    return state.vectors;
  }

  private async ensureIndexState(indexName: string): Promise<IndexState> {
    try {
      return this.require(indexName);
    } catch {
      await this.createIndex(
        indexName,
        {},
        { dynamicMapping: true, vectorDimensions: 256 },
      );
      return this.require(indexName);
    }
  }

  async indexDocument(
    indexName: string,
    input: {
      id?: DocumentId;
      fields: Record<string, JsonValue>;
      vector?: number[];
      meta?: Record<string, JsonValue>;
    },
  ): Promise<AnveshDocument> {
    const state = await this.ensureIndexState(indexName);
    const id = input.id ?? randomUUID();
    const fields = this.prepareFields(state, input.fields);
    let vector = input.vector;
    if (!vector && this.shouldAutoEmbed(state.definition.settings)) {
      const dims = state.definition.settings!.vectorDimensions!;
      vector = localEmbed(textFromFields(fields), dims);
    }
    const doc: AnveshDocument = {
      id,
      fields,
      meta: input.meta,
      updatedAt: new Date().toISOString(),
    };
    if (vector) {
      this.ensureVectorStore(state).upsert(id, vector);
      doc.vector = vector;
    }
    state.inverted.upsert(doc);
    state.definition.docCount = state.inverted.docCount;
    state.definition.updatedAt = doc.updatedAt!;
    this.markDirty(indexName);
    await this.flush(indexName);
    return doc;
  }

  async bulkIndex(indexName: string, items: BulkIndexItem[]): Promise<BulkIndexResult> {
    const state = await this.ensureIndexState(indexName);
    let indexed = 0;
    const errors: BulkIndexResult["errors"] = [];
    const auto = this.shouldAutoEmbed(state.definition.settings);
    const dims = state.definition.settings?.vectorDimensions;

    for (const item of items) {
      try {
        const id = item.id ?? randomUUID();
        const fields = this.prepareFields(state, item.fields);
        let vector = item.vector;
        if (!vector && auto && dims) {
          vector = localEmbed(textFromFields(fields), dims);
        }
        const doc: AnveshDocument = {
          id,
          fields,
          meta: item.meta,
          updatedAt: new Date().toISOString(),
        };
        if (vector) {
          this.ensureVectorStore(state).upsert(id, vector);
          doc.vector = vector;
        }
        state.inverted.upsert(doc);
        indexed += 1;
      } catch (err) {
        errors.push({
          id: item.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    state.definition.docCount = state.inverted.docCount;
    state.definition.updatedAt = new Date().toISOString();
    this.markDirty(indexName);
    await this.flush(indexName);

    const failed = errors.length;
    const msg = formatMessage("OK_BULK", { indexed, failed, index: indexName });
    return { indexed, failed, errors, message: msg.message };
  }

  async deleteDocument(indexName: string, id: DocumentId): Promise<void> {
    const state = this.require(indexName);
    const removed = state.inverted.remove(id);
    state.vectors?.remove(id);
    if (!removed) throw new AnveshError("ERR_DOC_NOT_FOUND", { index: indexName, id });
    state.definition.docCount = state.inverted.docCount;
    this.markDirty(indexName);
    await this.flush(indexName);
  }

  getDocument(indexName: string, id: DocumentId): AnveshDocument {
    const state = this.require(indexName);
    const doc = state.inverted.get(id);
    if (!doc) throw new AnveshError("ERR_DOC_NOT_FOUND", { index: indexName, id });
    return doc;
  }

  listDocuments(
    indexName: string,
    opts: { from?: number; size?: number } = {},
  ): { total: number; documents: AnveshDocument[] } {
    const state = this.require(indexName);
    const from = opts.from ?? 0;
    const size = Math.min(opts.size ?? 20, 200);
    const ids = state.inverted.listIds();
    const slice = ids.slice(from, from + size);
    const documents = slice
      .map((id) => state.inverted.get(id))
      .filter((d): d is AnveshDocument => Boolean(d))
      .map((d) => {
        const { vector: _v, ...rest } = d;
        return rest;
      });
    return { total: ids.length, documents };
  }

  async clearDocuments(indexName: string): Promise<{ deleted: number }> {
    const state = this.require(indexName);
    const ids = state.inverted.listIds();
    for (const id of ids) {
      state.inverted.remove(id);
      state.vectors?.remove(id);
    }
    state.definition.docCount = 0;
    state.definition.updatedAt = new Date().toISOString();
    this.markDirty(indexName);
    await this.flush(indexName);
    return { deleted: ids.length };
  }

  search(indexName: string, query: SearchQuery): SearchResult {
    const started = performance.now();
    const state = this.require(indexName);

    // Query Cache Lookup
    const cacheKey = JSON.stringify(query);
    const idxCache = this.queryCache.get(indexName);
    if (idxCache && idxCache.has(cacheKey)) {
      const cached = idxCache.get(cacheKey)!;
      const tookMs = Math.round((performance.now() - started) * 100) / 100;
      return { ...cached, tookMs };
    }

    globalCircuits.checkResultWindow(query.from ?? 0, query.size ?? 10);
    globalCircuits.checkMemory();
    const mode =
      query.mode ??
      (query.geo && !query.q && !query.vector
        ? "geo"
        : query.vector
          ? query.q
            ? "hybrid"
            : "semantic"
          : "keyword");
    const from = query.from ?? 0;
    const size = query.size ?? 10;
    const fuzzyOpts = {
      fuzziness: query.fuzziness,
      phrase: query.phrase,
      phraseSlop: query.phraseSlop,
      prefix: query.prefix,
      boosts: query.boosts,
      searchAfter: query.searchAfter,
      maxFuzzyCandidates: query.maxFuzzyCandidates ?? globalCircuits.config.maxFuzzyCandidates,
    };

    if (!query.q && !query.vector && !query.geo) {
      throw new AnveshError("ERR_EMPTY_QUERY", { index: indexName });
    }

    // Auto-embed query text when semantic/hybrid needs a vector but none was sent.
    let queryVector = query.vector;
    const needsVector = mode === "semantic" || mode === "hybrid";
    if (needsVector && !queryVector && query.q && this.shouldAutoEmbed(state.definition.settings)) {
      const dims = state.definition.settings!.vectorDimensions!;
      queryVector = localEmbed(query.q, dims);
      this.ensureVectorStore(state);
    }

    if (query.geo) {
      validateGeoQuery(query.geo);
      const mapping = state.definition.mappings[query.geo.field];
      if (!mapping || mapping.type !== "geo_point") {
        throw new AnveshError("ERR_VALIDATION", {
          detail: `geo.field "${query.geo.field}" must be mapped as geo_point`,
        });
      }
    }

    const textFields =
      query.fields?.length
        ? query.fields
        : Object.entries(state.definition.mappings)
            .filter(([, m]) => m.type === "text" || m.type === "keyword")
            .map(([f]) => f);

    let hits;
    let total = 0;

    if (mode === "geo") {
      if (!query.geo) {
        throw new AnveshError("ERR_VALIDATION", { detail: "mode geo requires a geo query object" });
      }
      const res = state.inverted.searchGeo({
        geo: query.geo,
        filters: query.filters,
        from,
        size,
      });
      hits = res.hits;
      total = res.total;
    } else if (mode === "keyword") {
      if (!query.q) throw new AnveshError("ERR_EMPTY_QUERY", { index: indexName });
      const filters = [...(query.filters ?? [])];
      if (query.must?.length) {
        for (const m of query.must) filters.push({ field: m.field, value: m.value });
      }
      if (query.mustNot?.length) {
        // emulate must_not via post-filter after search — handled below
      }
      const res = state.inverted.searchKeyword(query.q, textFields, {
        filters,
        geo: query.geo,
        from: query.searchAfter ? 0 : from,
        size: Math.max(size * (query.mustNot?.length || query.should?.length ? 3 : 1), size),
        highlight: query.highlight,
        minScore: query.minScore,
        ...fuzzyOpts,
      });
      let hitsList = res.hits;
      if (query.should?.length) {
        hitsList = hitsList.filter((h) =>
          query.should!.some((s) => h.source.fields[s.field] === s.value),
        );
      }
      if (query.mustNot?.length) {
        hitsList = hitsList.filter(
          (h) => !query.mustNot!.some((s) => h.source.fields[s.field] === s.value),
        );
      }
      hits = hitsList.slice(0, size);
      total = query.mustNot?.length || query.should?.length ? hitsList.length : res.total;
    } else if (mode === "semantic") {
      if (!queryVector || !state.vectors) {
        throw new AnveshError("ERR_VALIDATION", {
          detail:
            "semantic search needs a query vector (or q with autoEmbed) and vectorDimensions on the index",
        });
      }
      const candidateIds = state.inverted.filterDocIds(query.filters, query.geo);
      const candidates = new Set(candidateIds);
      const rawTop = state.vectors.search(queryVector, {
        topK: Math.max(from + size * 5, 100),
        candidates,
        minScore: query.minScore ?? -1,
      });
      const top =
        query.minScore != null
          ? rawTop
          : meaningfulVectorHits(rawTop, { topK: from + size * 3 });
      total = top.length;
      hits = top.slice(from, from + size).map((r) => {
        const source = this.publicDoc(state.inverted.get(r.id)!);
        const hit = { id: r.id, score: Math.round(r.score * 1000) / 1000, source };
        if (query.geo?.origin) {
          const d = distanceFromOrigin(source.fields[query.geo.field], query.geo.origin);
          if (d !== null) return { ...hit, distanceKm: Math.round(d * 1000) / 1000 };
        }
        return hit;
      });
    } else {
      // hybrid
      if (!query.q || !queryVector || !state.vectors) {
        throw new AnveshError("ERR_VALIDATION", {
          detail:
            "hybrid search needs q and a vector (or autoEmbed) with vectorDimensions configured",
        });
      }
      const kwRes = state.inverted.searchKeyword(query.q, textFields, {
        filters: query.filters,
        geo: query.geo,
        from: 0,
        size: Math.max(size * 5, 50),
        highlight: Boolean(query.highlight),
        ...fuzzyOpts,
      });
      const keywordScores = new Map(kwRes.hits.map((h) => [h.id, h.score]));
      const candidateIds = state.inverted.filterDocIds(query.filters, query.geo);
      const semRaw = state.vectors.search(queryVector, {
        topK: Math.max(size * 5, 50),
        candidates: new Set(candidateIds),
      });
      const semKept = meaningfulVectorHits(semRaw, { topK: Math.max(size * 5, 50) });
      const semanticScores = new Map(semKept.map((r) => [r.id, r.score]));
      // Only blend docs that matched keyword OR cleared the semantic floor
      const blendIds = new Set<string>([...keywordScores.keys(), ...semanticScores.keys()]);
      const docs = new Map(
        [...blendIds]
          .map((id) => [id, state.inverted.get(id)!] as const)
          .filter(([, d]) => Boolean(d)),
      );
      const hybridStrategy =
        query.hybridRankingMode ?? state.definition.settings?.hybridRankingMode ?? "linear";
      const weight = state.definition.settings?.hybridKeywordWeight ?? 0.55;
      const rrfK = query.rrfK ?? state.definition.settings?.rrfK ?? 60;
      const blended =
        hybridStrategy === "rrf"
          ? reciprocalRankFusion(keywordScores, semanticScores, rrfK, docs)
          : blendScores(keywordScores, semanticScores, weight, docs);
      const filtered = query.minScore
        ? blended.filter((h) => h.score >= query.minScore!)
        : blended.filter((h) => h.score > 0.01);
      total = filtered.length;
      hits = filtered.slice(from, from + size).map((h) => {
        const source = this.publicDoc(h.source);
        const base = {
          ...h,
          score: Math.round(h.score * 1000) / 1000,
          source,
          highlight: h.highlight ?? kwRes.hits.find((k) => k.id === h.id)?.highlight,
        };
        if (query.geo?.origin) {
          const d = distanceFromOrigin(source.fields[query.geo.field], query.geo.origin);
          if (d !== null) return { ...base, distanceKm: Math.round(d * 1000) / 1000 };
        }
        return base;
      });
    }

    // Keyword / geo hits may still carry stored vectors — strip before response
    if (mode === "keyword" || mode === "geo") {
      hits = hits.map((h) => ({ ...h, source: this.publicDoc(h.source) }));
    }

    let facets: SearchResult["facets"];
    if (query.facets?.length) {
      facets = {};
      const idSet = new Set(hits.map((h) => h.id));
      for (const f of query.facets) {
        if (f.startsWith("stats:")) {
          const field = f.slice("stats:".length);
          const s = state.inverted.statsFacet(field, idSet.size ? idSet : undefined);
          facets[f] = [
            { key: "count", count: s.count },
            { key: "min", count: s.min },
            { key: "max", count: s.max },
            { key: "avg", count: s.avg },
            { key: "sum", count: s.sum },
          ];
        } else if (f.startsWith("histogram:")) {
          const rest = f.slice("histogram:".length);
          const [field, intervalRaw] = rest.split(":");
          const interval = Number(intervalRaw ?? 10);
          facets[f] = state.inverted.histogramFacet(
            field!,
            interval,
            idSet.size ? idSet : undefined,
          );
        } else {
          facets[f] = state.inverted.facet(f, idSet.size ? idSet : undefined);
        }
      }
    }

    const tookMs = Math.round((performance.now() - started) * 100) / 100;
    const message = formatMessage("OK_SEARCH", {
      total,
      tookMs,
      mode,
      index: indexName,
    }).message;

    const res: SearchResult = { tookMs, total, hits, facets, message };

    // Store in query cache
    const maxCache = state.definition.settings?.queryCacheSize ?? 100;
    if (maxCache > 0) {
      if (!this.queryCache.has(indexName)) {
        this.queryCache.set(indexName, new Map());
      }
      const idxMap = this.queryCache.get(indexName)!;
      if (idxMap.size >= maxCache) {
        const firstKey = idxMap.keys().next().value;
        if (firstKey) idxMap.delete(firstKey);
      }
      idxMap.set(cacheKey, res);
    }

    return res;
  }

  stats(): { indexes: number; documents: number; dirty: number } {
    let documents = 0;
    for (const s of this.indexes.values()) documents += s.inverted.docCount;
    return { indexes: this.indexes.size, documents, dirty: this.dirty.size };
  }
}
