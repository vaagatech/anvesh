/**
 * In-memory inverted index segment — postings + field norms + stored docs.
 */

import { getAnalyzer, fieldToText, tokenize } from "./analyzer.js";
import { bm25TermScore } from "./bm25.js";
// @ts-ignore
import synonyms from "synonyms";
import { distanceFromOrigin, matchesGeo } from "./geo.js";
import { levenshtein, resolveFuzziness, wildcardMatch } from "./fuzzy.js";
import { globalCircuits } from "./circuit.js";
import type {
  AnveshDocument,
  DocumentId,
  FieldMapping,
  GeoQuery,
  IndexSettings,
  SearchHit,
  TermFilter,
  RangeFilter,
} from "../types.js";

export interface Posting {
  docId: DocumentId;
  /** Term frequency in this field. */
  tf: number;
  positions: number[];
}

export interface InvertedIndexSnapshot {
  postings: Record<string, Record<string, Posting[]>>;
  docLengths: Record<string, Record<string, number>>;
  documents: Record<string, AnveshDocument>;
  fieldDocFreq: Record<string, Record<string, number>>;
  avgFieldLength: Record<string, number>;
  docCount: number;
}

export class InvertedIndex {
  /** field -> term -> postings */
  private postings = new Map<string, Map<string, Posting[]>>();
  /** field -> docId -> length */
  private docLengths = new Map<string, Map<DocumentId, number>>();
  private documents = new Map<DocumentId, AnveshDocument>();
  /** field -> term -> df */
  private fieldDocFreq = new Map<string, Map<string, number>>();
  private avgFieldLength = new Map<string, number>();
  private totalFieldLength = new Map<string, number>();
  docCount = 0;

  constructor(
    private readonly mappings: Record<string, FieldMapping>,
    private readonly settings: IndexSettings = {},
  ) {}

  has(id: DocumentId): boolean {
    return this.documents.has(id);
  }

  get(id: DocumentId): AnveshDocument | undefined {
    return this.documents.get(id);
  }

  listIds(): DocumentId[] {
    return [...this.documents.keys()];
  }

  upsert(doc: AnveshDocument): void {
    if (this.documents.has(doc.id)) {
      this.remove(doc.id);
    }
    this.documents.set(doc.id, { ...doc, updatedAt: new Date().toISOString() });
    this.docCount = this.documents.size;

    for (const [field, mapping] of Object.entries(this.mappings)) {
      if (mapping.index === false) continue;
      if (mapping.type !== "text" && mapping.type !== "keyword") continue;
      const raw = doc.fields[field];
      if (raw === undefined) continue;
      const analyzer = getAnalyzer(mapping.analyzer ?? (mapping.type === "keyword" ? "keyword" : "standard"));
      const tokens = analyzer.analyze(fieldToText(raw));
      if (!this.docLengths.has(field)) this.docLengths.set(field, new Map());
      this.docLengths.get(field)!.set(doc.id, tokens.length);
      this.totalFieldLength.set(field, (this.totalFieldLength.get(field) ?? 0) + tokens.length);
      this.recomputeAvg(field);

      const tfMap = new Map<string, { tf: number; positions: number[] }>();
      tokens.forEach((term, pos) => {
        const cur = tfMap.get(term) ?? { tf: 0, positions: [] };
        cur.tf += 1;
        cur.positions.push(pos);
        tfMap.set(term, cur);
      });

      if (!this.postings.has(field)) this.postings.set(field, new Map());
      if (!this.fieldDocFreq.has(field)) this.fieldDocFreq.set(field, new Map());
      const fieldPostings = this.postings.get(field)!;
      const df = this.fieldDocFreq.get(field)!;

      for (const [term, { tf, positions }] of tfMap) {
        const list = fieldPostings.get(term) ?? [];
        list.push({ docId: doc.id, tf, positions });
        fieldPostings.set(term, list);
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }
  }

  remove(id: DocumentId): boolean {
    const existing = this.documents.get(id);
    if (!existing) return false;

    for (const [field, mapping] of Object.entries(this.mappings)) {
      if (mapping.type !== "text" && mapping.type !== "keyword") continue;
      const analyzer = getAnalyzer(mapping.analyzer ?? (mapping.type === "keyword" ? "keyword" : "standard"));
      const tokens = analyzer.analyze(fieldToText(existing.fields[field]));
      const unique = new Set(tokens);
      const fieldPostings = this.postings.get(field);
      const df = this.fieldDocFreq.get(field);
      if (fieldPostings && df) {
        for (const term of unique) {
          const list = fieldPostings.get(term);
          if (!list) continue;
          const next = list.filter((p) => p.docId !== id);
          if (next.length) fieldPostings.set(term, next);
          else fieldPostings.delete(term);
          const nextDf = (df.get(term) ?? 1) - 1;
          if (nextDf <= 0) df.delete(term);
          else df.set(term, nextDf);
        }
      }
      const lengths = this.docLengths.get(field);
      if (lengths) {
        const len = lengths.get(id) ?? 0;
        lengths.delete(id);
        this.totalFieldLength.set(field, Math.max(0, (this.totalFieldLength.get(field) ?? 0) - len));
        this.recomputeAvg(field);
      }
    }

    this.documents.delete(id);
    this.docCount = this.documents.size;
    return true;
  }

  private recomputeAvg(field: string): void {
    const n = this.docLengths.get(field)?.size ?? 0;
    const total = this.totalFieldLength.get(field) ?? 0;
    this.avgFieldLength.set(field, n > 0 ? total / n : 0);
  }

  private matchesFilters(
    doc: AnveshDocument,
    filters?: Array<TermFilter | RangeFilter>,
    geo?: GeoQuery,
  ): boolean {
    if (geo && !matchesGeo(doc.fields[geo.field], geo)) return false;
    if (!filters?.length) return true;
    for (const f of filters) {
      const value = doc.fields[f.field];
      if ("value" in f) {
        if (value !== f.value && String(value) !== String(f.value)) return false;
      } else {
        const raw = value;
        if (typeof raw === "number" || (typeof raw === "string" && !Number.isNaN(Number(raw)))) {
          const num = typeof raw === "number" ? raw : Number(raw);
          if (f.gte !== undefined && num < Number(f.gte)) return false;
          if (f.lte !== undefined && num > Number(f.lte)) return false;
          if (f.gt !== undefined && num <= Number(f.gt)) return false;
          if (f.lt !== undefined && num >= Number(f.lt)) return false;
        } else if (typeof raw === "string") {
          if (f.gte !== undefined && raw < String(f.gte)) return false;
          if (f.lte !== undefined && raw > String(f.lte)) return false;
          if (f.gt !== undefined && raw <= String(f.gt)) return false;
          if (f.lt !== undefined && raw >= String(f.lt)) return false;
        } else {
          return false;
        }
      }
    }
    return true;
  }

  searchKeyword(
    query: string,
    fields: string[],
    options: {
      filters?: Array<TermFilter | RangeFilter>;
      geo?: GeoQuery;
      from?: number;
      size?: number;
      highlight?: boolean;
      minScore?: number;
      fuzziness?: boolean | 0 | 1 | 2 | "AUTO";
      phrase?: boolean;
      phraseSlop?: number;
      prefix?: boolean;
      boosts?: Record<string, number>;
      searchAfter?: string;
      maxFuzzyCandidates?: number;
    } = {},
  ): { total: number; hits: SearchHit[] } {
    const rawTokens = query.trim().split(/\s+/).filter(Boolean);
    const hasWildcard = rawTokens.some((t) => /[*?]/.test(t));
    const tokens = hasWildcard
      ? rawTokens.map((t) => t.toLowerCase())
      : getAnalyzer("standard").analyze(query);
    if (!tokens.length) return { total: 0, hits: [] };

    const scores = new Map<DocumentId, number>();
    const matchedTerms = new Map<DocumentId, Set<string>>();
    const fuzzyCap = options.maxFuzzyCandidates ?? 50;

    const collectTerms = (
      fieldPostings: Map<string, Posting[]>,
      term: string,
    ): Array<{ term: string; distance: number }> => {
      if (hasWildcard && /[*?]/.test(term)) {
        const out: Array<{ term: string; distance: number }> = [];
        for (const dictTerm of fieldPostings.keys()) {
          if (wildcardMatch(term, dictTerm)) out.push({ term: dictTerm, distance: 0 });
          if (out.length >= fuzzyCap) break;
        }
        return out;
      }
      if (options.prefix) {
        const out: Array<{ term: string; distance: number }> = [];
        for (const dictTerm of fieldPostings.keys()) {
          if (dictTerm.startsWith(term)) out.push({ term: dictTerm, distance: 0 });
          if (out.length >= fuzzyCap) break;
        }
        return out.length ? out : fieldPostings.has(term) ? [{ term, distance: 0 }] : [];
      }
      const maxDist = resolveFuzziness(options.fuzziness, term.length);
      if (maxDist === 0) {
        return fieldPostings.has(term) ? [{ term, distance: 0 }] : [];
      }
      const out: Array<{ term: string; distance: number }> = [];
      const hasExact = fieldPostings.has(term);
      if (hasExact) {
        out.push({ term, distance: 0 });
        if (options.fuzziness === undefined || options.fuzziness === "AUTO") {
          return out;
        }
      }
      for (const dictTerm of fieldPostings.keys()) {
        if (dictTerm === term) continue;
        if (Math.abs(dictTerm.length - term.length) > maxDist) continue;
        if (maxDist === 1 && dictTerm[0] !== term[0]) continue;
        const d = levenshtein(term, dictTerm);
        if (d > 0 && d <= maxDist) out.push({ term: dictTerm, distance: d });
        if (out.length >= fuzzyCap) {
          globalCircuits.capFuzzy(fuzzyCap + 1);
          break;
        }
      }
      return out;
    };

    for (const field of fields) {
      const fieldPostings = this.postings.get(field);
      const dfMap = this.fieldDocFreq.get(field);
      if (!fieldPostings || !dfMap) continue;
      const avgLen = this.avgFieldLength.get(field) ?? 0;
      const lengths = this.docLengths.get(field);
      const boost = options.boosts?.[field] ?? 1;

      if (options.phrase && tokens.length > 1 && !hasWildcard) {
        const slop = options.phraseSlop ?? 0;
        const firstTermPostings = fieldPostings.get(tokens[0]!);
        if (!firstTermPostings) continue;

        for (const firstPost of firstTermPostings) {
          const docId = firstPost.docId;
          const doc = this.documents.get(docId);
          if (!doc || !this.matchesFilters(doc, options.filters, options.geo)) continue;
          const positionsByTerm = tokens.map((t) => {
            const posts = fieldPostings.get(t)?.filter((p) => p.docId === docId) ?? [];
            return posts.flatMap((p) => p.positions);
          });
          if (positionsByTerm.some((p) => !p.length)) continue;
          let ok = false;
          for (const p0 of positionsByTerm[0]!) {
            let cursor = p0;
            let matched = true;
            for (let i = 1; i < positionsByTerm.length; i++) {
              const next = positionsByTerm[i]!.find((p) => p >= cursor + 1 && p <= cursor + 1 + slop);
              if (next === undefined) {
                matched = false;
                break;
              }
              cursor = next;
            }
            if (matched) {
              ok = true;
              break;
            }
          }
          if (!ok) continue;
          const add = 2.5 * boost;
          scores.set(docId, (scores.get(docId) ?? 0) + add);
          if (!matchedTerms.has(docId)) matchedTerms.set(docId, new Set());
          for (const t of tokens) matchedTerms.get(docId)!.add(t);
        }
        continue;
      }

      for (const term of tokens) {
        const variants = collectTerms(fieldPostings, term);
        for (const { term: dictTerm, distance } of variants) {
          const postings = fieldPostings.get(dictTerm);
          if (!postings) continue;
          const df = dfMap.get(dictTerm) ?? postings.length;
          const decay = distance === 0 ? 1 : 1 / (1 + distance);
          for (const p of postings) {
            const doc = this.documents.get(p.docId);
            if (!doc || !this.matchesFilters(doc, options.filters, options.geo)) continue;
            const dl = lengths?.get(p.docId) ?? 0;
            const add =
              bm25TermScore(p.tf, dl, avgLen, df, this.docCount, {
                k1: this.settings.bm25k1,
                b: this.settings.bm25b,
              }) *
              decay *
              boost;
            scores.set(p.docId, (scores.get(p.docId) ?? 0) + add);
            if (!matchedTerms.has(p.docId)) matchedTerms.set(p.docId, new Set());
            matchedTerms.get(p.docId)!.add(dictTerm);
          }
        }
      }
    }

    const minScore = options.minScore ?? 0;
    const lowerQuery = query.toLowerCase();

    let ranked = [...scores.entries()]
      .filter(([, s]) => s >= minScore)
      .map(([id, s]) => {
        let boosted = s;
        // Exact Phrase Boost
        if (!hasWildcard && tokens.length > 1) {
          const doc = this.documents.get(id);
          if (doc) {
            for (const field of fields) {
              const text = fieldToText(doc.fields[field]);
              if (text && text.toLowerCase().includes(lowerQuery)) {
                boosted *= 1.5;
                break;
              }
            }
          }
        }
        return [id, boosted] as [string, number];
      })
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    if (options.searchAfter) {
      const idx = ranked.findIndex(([id]) => id === options.searchAfter);
      ranked = idx >= 0 ? ranked.slice(idx + 1) : ranked;
    }

    const total = ranked.length;
    const from = options.searchAfter ? 0 : (options.from ?? 0);
    const size = options.size ?? 10;
    ranked = ranked.slice(from, from + size);

    const hits: SearchHit[] = ranked.map(([id, score]) => {
      const source = this.documents.get(id)!;
      const hit: SearchHit = { id, score, source };
      if (options.highlight) {
        hit.highlight = this.buildHighlight(source, fields, matchedTerms.get(id) ?? new Set());
      }
      if (options.geo?.origin) {
        const d = distanceFromOrigin(source.fields[options.geo.field], options.geo.origin);
        if (d !== null) hit.distanceKm = Math.round(d * 1000) / 1000;
      }
      return hit;
    });

    return { total, hits };
  }

  /**
   * Geo-only (or filter+geo) search — optional distance sort from origin.
   */
  searchGeo(options: {
    geo: GeoQuery;
    filters?: Array<TermFilter | RangeFilter>;
    from?: number;
    size?: number;
  }): { total: number; hits: SearchHit[] } {
    const sortByDistance =
      options.geo.sortByDistance !== false && Boolean(options.geo.origin);

    const candidates: Array<{ id: DocumentId; distanceKm: number | null }> = [];
    for (const id of this.listIds()) {
      const doc = this.documents.get(id)!;
      if (!this.matchesFilters(doc, options.filters, options.geo)) continue;
      const distanceKm = options.geo.origin
        ? distanceFromOrigin(doc.fields[options.geo.field], options.geo.origin)
        : null;
      candidates.push({ id, distanceKm });
    }

    if (sortByDistance) {
      candidates.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }

    const total = candidates.length;
    const from = options.from ?? 0;
    const size = options.size ?? 10;
    const slice = candidates.slice(from, from + size);

    const hits: SearchHit[] = slice.map((c, i) => {
      const source = this.documents.get(c.id)!;
      const hit: SearchHit = {
        id: c.id,
        // Higher score for nearer docs when sorting by distance
        score: sortByDistance
          ? 1 / (1 + (c.distanceKm ?? 0))
          : total - from - i,
        source,
      };
      if (c.distanceKm !== null) {
        hit.distanceKm = Math.round(c.distanceKm * 1000) / 1000;
      }
      return hit;
    });

    return { total, hits };
  }

  public generateSemanticHighlight(
    doc: AnveshDocument,
    fields: string[],
    queryText: string,
  ): Record<string, string[]> {
    const tokens = tokenize(queryText, { stopwords: true, stemming: false });
    const expandedTerms = new Set<string>();

    for (const t of tokens) {
      expandedTerms.add(t);
      const dict = synonyms(t);
      if (dict) {
        Object.values(dict)
          .flat()
          .forEach((syn: any) => expandedTerms.add(String(syn).toLowerCase()));
      }
    }

    return this.buildHighlight(doc, fields, expandedTerms);
  }

  private truncateSnippet(text: string, maxLength = 240): string {
    if (text.length <= maxLength) return text;
    const sub = text.slice(0, maxLength);
    const lastPeriod = sub.lastIndexOf(". ");
    if (lastPeriod > maxLength * 0.5) return sub.slice(0, lastPeriod + 1);
    const lastSpace = sub.lastIndexOf(" ");
    if (lastSpace > 0) return sub.slice(0, lastSpace) + "…";
    return sub + "…";
  }

  private buildHighlight(
    doc: AnveshDocument,
    fields: string[],
    terms: Set<string>,
  ): Record<string, string[]> {
    const out: Record<string, string[]> = {};

    for (const field of fields) {
      const text = fieldToText(doc.fields[field]);
      if (!text) continue;
      
      if (terms.size === 0) {
        out[field] = [this.truncateSnippet(text)];
        continue;
      }

      const lower = text.toLowerCase();
      const matches: { start: number; end: number; term: string }[] = [];
      
      for (const term of terms) {
        const searchStr = term.length > 4 ? term.slice(0, 4) : term;
        let idx = -1;
        while ((idx = lower.indexOf(searchStr, idx + 1)) >= 0) {
          matches.push({ start: idx, end: idx + searchStr.length, term });
        }
      }

      if (matches.length === 0) {
        out[field] = [this.truncateSnippet(text)];
        continue;
      }
      matches.sort((a, b) => a.start - b.start);

      let bestWindow = { start: 0, end: 0, score: 0 };
      const WINDOW_SIZE = 150;

      for (let i = 0; i < matches.length; i++) {
        const windowStart = matches[i]!.start;
        const windowEnd = windowStart + WINDOW_SIZE;
        const uniqueTerms = new Set<string>();
        let lastMatchEnd = windowStart;

        for (let j = i; j < matches.length; j++) {
          if (matches[j]!.start > windowEnd) break;
          uniqueTerms.add(matches[j]!.term);
          lastMatchEnd = Math.max(lastMatchEnd, matches[j]!.end);
        }

        const score = uniqueTerms.size;
        if (score > bestWindow.score) {
          bestWindow = { start: windowStart, end: lastMatchEnd, score };
        }
      }

      let snipStart = Math.max(0, bestWindow.start - 40);
      let snipEnd = Math.min(text.length, bestWindow.end + 40);

      if (snipStart > 0) {
        const spaceIdx = text.lastIndexOf(" ", snipStart);
        if (spaceIdx !== -1) snipStart = spaceIdx + 1;
      }
      if (snipEnd < text.length) {
        const spaceIdx = text.indexOf(" ", snipEnd);
        if (spaceIdx !== -1) snipEnd = spaceIdx;
      }

      let snip = text.slice(snipStart, snipEnd);
      for (const t of terms) {
        const re = new RegExp(`(${escapeRegExp(t)})`, "ig");
        snip = snip.replace(re, "<em>$1</em>");
      }

      out[field] = [(snipStart > 0 ? "… " : "") + snip.trim() + (snipEnd < text.length ? " …" : "")];
    }
    return out;
  }

  facet(field: string, docIds?: Set<DocumentId>): Array<{ key: string | number | boolean; count: number }> {
    const counts = new Map<string, { key: string | number | boolean; count: number }>();
    for (const [id, doc] of this.documents) {
      if (docIds && !docIds.has(id)) continue;
      const v = doc.fields[field];
      if (v === undefined || v === null || typeof v === "object") continue;
      const k = String(v);
      const cur = counts.get(k) ?? { key: v as string | number | boolean, count: 0 };
      cur.count += 1;
      counts.set(k, cur);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }

  /** Numeric stats aggregation. */
  statsFacet(
    field: string,
    docIds?: Set<DocumentId>,
  ): { count: number; min: number; max: number; avg: number; sum: number } {
    let count = 0;
    let sum = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const [id, doc] of this.documents) {
      if (docIds && !docIds.has(id)) continue;
      const v = doc.fields[field];
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) continue;
      count += 1;
      sum += n;
      if (n < min) min = n;
      if (n > max) max = n;
    }
    if (!count) return { count: 0, min: 0, max: 0, avg: 0, sum: 0 };
    return { count, min, max, avg: sum / count, sum };
  }

  /** Fixed-interval histogram on a numeric field. */
  histogramFacet(
    field: string,
    interval: number,
    docIds?: Set<DocumentId>,
  ): Array<{ key: number; count: number }> {
    if (!(interval > 0)) return [];
    const counts = new Map<number, number>();
    for (const [id, doc] of this.documents) {
      if (docIds && !docIds.has(id)) continue;
      const v = doc.fields[field];
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) continue;
      const bucket = Math.floor(n / interval) * interval;
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => a.key - b.key);
  }

  /** Prefix completions from the term dictionary. */
  suggest(prefix: string, field?: string, size = 10): string[] {
    const p = prefix.toLowerCase();
    const out: string[] = [];
    const fields = field ? [field] : [...this.postings.keys()];
    const seen = new Set<string>();
    for (const f of fields) {
      const terms = this.postings.get(f);
      if (!terms) continue;
      for (const term of terms.keys()) {
        if (!term.startsWith(p) || seen.has(term)) continue;
        seen.add(term);
        out.push(term);
        if (out.length >= size) return out;
      }
    }
    return out;
  }

  /** All docs matching filters (for semantic/hybrid candidate narrowing). */
  filterDocIds(filters?: Array<TermFilter | RangeFilter>, geo?: GeoQuery): DocumentId[] {
    return this.listIds().filter((id) =>
      this.matchesFilters(this.documents.get(id)!, filters, geo),
    );
  }

  toSnapshot(): InvertedIndexSnapshot {
    const postings: InvertedIndexSnapshot["postings"] = {};
    for (const [field, terms] of this.postings) {
      postings[field] = {};
      for (const [term, list] of terms) {
        postings[field]![term] = list;
      }
    }
    const docLengths: InvertedIndexSnapshot["docLengths"] = {};
    for (const [field, map] of this.docLengths) {
      docLengths[field] = Object.fromEntries(map);
    }
    const fieldDocFreq: InvertedIndexSnapshot["fieldDocFreq"] = {};
    for (const [field, map] of this.fieldDocFreq) {
      fieldDocFreq[field] = Object.fromEntries(map);
    }
    return {
      postings,
      docLengths,
      documents: Object.fromEntries(this.documents),
      fieldDocFreq,
      avgFieldLength: Object.fromEntries(this.avgFieldLength),
      docCount: this.docCount,
    };
  }

  static fromSnapshot(
    snapshot: InvertedIndexSnapshot,
    mappings: Record<string, FieldMapping>,
    settings: IndexSettings = {},
  ): InvertedIndex {
    const idx = new InvertedIndex(mappings, settings);
    idx.docCount = snapshot.docCount;
    idx.documents = new Map(Object.entries(snapshot.documents));
    idx.avgFieldLength = new Map(Object.entries(snapshot.avgFieldLength));
    for (const [field, terms] of Object.entries(snapshot.postings)) {
      const m = new Map<string, Posting[]>();
      for (const [term, list] of Object.entries(terms)) m.set(term, list);
      idx.postings.set(field, m);
    }
    for (const [field, map] of Object.entries(snapshot.docLengths)) {
      idx.docLengths.set(field, new Map(Object.entries(map)));
      let total = 0;
      for (const len of Object.values(map)) total += len;
      idx.totalFieldLength.set(field, total);
    }
    for (const [field, map] of Object.entries(snapshot.fieldDocFreq)) {
      idx.fieldDocFreq.set(field, new Map(Object.entries(map)));
    }
    return idx;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
