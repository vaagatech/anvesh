/**
 * Anvesh Engine — orchestrates inverted index + vector store per named index.
 */

import { randomUUID } from "node:crypto";
import { InvertedIndex, type InvertedIndexSnapshot } from "./inverted-index.js";
import { VectorStore, type VectorStoreSnapshot } from "./vector-store.js";
import { blendScores } from "./hybrid.js";
import { assertGeoPoint, distanceFromOrigin, validateGeoQuery } from "./geo.js";
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
    const vectors =
      raw.vectors && raw.definition.settings?.vectorDimensions
        ? VectorStore.fromSnapshot(raw.vectors)
        : raw.definition.settings?.vectorDimensions
          ? new VectorStore(raw.definition.settings.vectorDimensions)
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

  async createIndex(
    name: string,
    mappings: Record<string, FieldMapping>,
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
    const now = new Date().toISOString();
    const definition: IndexDefinition = {
      name,
      mappings,
      settings,
      createdAt: now,
      updatedAt: now,
      docCount: 0,
    };
    const inverted = new InvertedIndex(mappings, settings);
    const vectors = settings.vectorDimensions
      ? new VectorStore(settings.vectorDimensions)
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
    const state = this.indexes.get(name);
    if (!state) throw new AnveshError("ERR_INDEX_NOT_FOUND", { name });
    return state;
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

  async indexDocument(
    indexName: string,
    input: {
      id?: DocumentId;
      fields: Record<string, JsonValue>;
      vector?: number[];
      meta?: Record<string, JsonValue>;
    },
  ): Promise<AnveshDocument> {
    const state = this.require(indexName);
    const id = input.id ?? randomUUID();
    const doc: AnveshDocument = {
      id,
      fields: this.normalizeFields(state.definition.mappings, input.fields),
      meta: input.meta,
      updatedAt: new Date().toISOString(),
    };
    if (input.vector) {
      if (!state.vectors) {
        throw new AnveshError("ERR_VALIDATION", {
          detail: "index has no vectorDimensions; set settings.vectorDimensions to enable vectors",
        });
      }
      state.vectors.upsert(id, input.vector);
      doc.vector = input.vector;
    }
    state.inverted.upsert(doc);
    state.definition.docCount = state.inverted.docCount;
    state.definition.updatedAt = doc.updatedAt!;
    this.markDirty(indexName);
    await this.flush(indexName);
    return doc;
  }

  async bulkIndex(indexName: string, items: BulkIndexItem[]): Promise<BulkIndexResult> {
    const state = this.require(indexName);
    let indexed = 0;
    const errors: BulkIndexResult["errors"] = [];

    for (const item of items) {
      try {
        const id = item.id ?? randomUUID();
        const doc: AnveshDocument = {
          id,
          fields: this.normalizeFields(state.definition.mappings, item.fields),
          meta: item.meta,
          updatedAt: new Date().toISOString(),
        };
        if (item.vector) {
          if (!state.vectors) {
            throw new AnveshError("ERR_VALIDATION", {
              detail: "index has no vectorDimensions configured",
            });
          }
          state.vectors.upsert(id, item.vector);
          doc.vector = item.vector;
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

  search(indexName: string, query: SearchQuery): SearchResult {
    const started = performance.now();
    const state = this.require(indexName);
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

    if (!query.q && !query.vector && !query.geo) {
      throw new AnveshError("ERR_EMPTY_QUERY", { index: indexName });
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
      const res = state.inverted.searchKeyword(query.q, textFields, {
        filters: query.filters,
        geo: query.geo,
        from,
        size,
        highlight: query.highlight,
        minScore: query.minScore,
      });
      hits = res.hits;
      total = res.total;
    } else if (mode === "semantic") {
      if (!query.vector || !state.vectors) {
        throw new AnveshError("ERR_VALIDATION", {
          detail: "semantic search requires a query vector and vectorDimensions on the index",
        });
      }
      const candidateIds = state.inverted.filterDocIds(query.filters, query.geo);
      const candidates = new Set(candidateIds);
      const top = state.vectors.search(query.vector, {
        topK: from + size,
        candidates,
        minScore: query.minScore,
      });
      total = top.length;
      hits = top.slice(from, from + size).map((r) => {
        const source = state.inverted.get(r.id)!;
        const hit = { id: r.id, score: r.score, source };
        if (query.geo?.origin) {
          const d = distanceFromOrigin(source.fields[query.geo.field], query.geo.origin);
          if (d !== null) return { ...hit, distanceKm: Math.round(d * 1000) / 1000 };
        }
        return hit;
      });
    } else {
      // hybrid
      if (!query.q || !query.vector || !state.vectors) {
        throw new AnveshError("ERR_VALIDATION", {
          detail: "hybrid search requires both q and vector, with vectorDimensions configured",
        });
      }
      const kwRes = state.inverted.searchKeyword(query.q, textFields, {
        filters: query.filters,
        geo: query.geo,
        from: 0,
        size: Math.max(size * 5, 50),
        highlight: false,
      });
      const keywordScores = new Map(kwRes.hits.map((h) => [h.id, h.score]));
      const candidateIds = state.inverted.filterDocIds(query.filters, query.geo);
      const sem = state.vectors.search(query.vector, {
        topK: Math.max(size * 5, 50),
        candidates: new Set(candidateIds),
      });
      const semanticScores = new Map(sem.map((r) => [r.id, r.score]));
      const docs = new Map(
        state.inverted.listIds().map((id) => [id, state.inverted.get(id)!] as const),
      );
      const weight = state.definition.settings?.hybridKeywordWeight ?? 0.5;
      const blended = blendScores(keywordScores, semanticScores, weight, docs);
      const filtered = query.minScore
        ? blended.filter((h) => h.score >= query.minScore!)
        : blended;
      total = filtered.length;
      hits = filtered.slice(from, from + size).map((h) => {
        if (query.geo?.origin) {
          const d = distanceFromOrigin(h.source.fields[query.geo.field], query.geo.origin);
          if (d !== null) return { ...h, distanceKm: Math.round(d * 1000) / 1000 };
        }
        return h;
      });
      if (query.highlight && query.q) {
        const terms = new Set(
          query.q
            .toLowerCase()
            .split(/\W+/)
            .filter(Boolean),
        );
        hits = hits.map((h) => {
          const highlight: Record<string, string[]> = {};
          for (const field of textFields) {
            const text = String(h.source.fields[field] ?? "");
            if (!text) continue;
            for (const t of terms) {
              if (text.toLowerCase().includes(t)) {
                highlight[field] = [`…${text.slice(0, 120)}…`];
                break;
              }
            }
          }
          return { ...h, highlight };
        });
      }
    }

    let facets: SearchResult["facets"];
    if (query.facets?.length) {
      facets = {};
      const idSet = new Set(hits.map((h) => h.id));
      for (const f of query.facets) {
        facets[f] = state.inverted.facet(f, idSet.size ? idSet : undefined);
      }
    }

    const tookMs = Math.round((performance.now() - started) * 100) / 100;
    const message = formatMessage("OK_SEARCH", {
      total,
      tookMs,
      mode,
      index: indexName,
    }).message;

    return { tookMs, total, hits, facets, message };
  }

  stats(): { indexes: number; documents: number; dirty: number } {
    let documents = 0;
    for (const s of this.indexes.values()) documents += s.inverted.docCount;
    return { indexes: this.indexes.size, documents, dirty: this.dirty.size };
  }
}
