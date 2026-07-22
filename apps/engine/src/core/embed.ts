/**
 * Local embeddings for autoEmbed — no external API.
 * Stemmed tokens + char n-grams + light synonyms so paraphrases
 * share signal (far more believable than naive hashing alone).
 */
import { stem, tokenize } from "./analyzer.js";

/** Demo / product synonym clusters — expands the token bag before projection. */
const SYNONYM_GROUPS: string[][] = [
  ["search", "find", "query", "lookup", "retrieve", "rank", "ranking"],
  ["keyword", "bm25", "fulltext", "full", "text", "lexical"],
  ["semantic", "vector", "embedding", "meaning", "similar", "similarity", "hybrid"],
  ["geo", "location", "map", "nearby", "near", "radius", "place", "places", "distance", "bengaluru", "bangalore"],
  ["crawl", "crawler", "spider", "scrape", "scraping", "site"],
  ["index", "indexer", "ingest", "bulk", "document", "documents", "corpus"],
  ["hub", "rbac", "admin", "operator", "viewer", "control", "plane"],
  ["auth", "login", "password", "role", "roles", "permission"],
  ["lightweight", "simple", "local", "nodejs", "node"],
  ["engine", "anvesh", "vaagatech"],
];

const SYNONYM_MAP = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  const stemmed = [...new Set(group.map((w) => stem(w.toLowerCase())))];
  for (const t of stemmed) {
    SYNONYM_MAP.set(
      t,
      stemmed.filter((x) => x !== t),
    );
  }
}

function hash32(s: string, seed = 0): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function expandTokens(tokens: string[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    out.push(t);
    const syns = SYNONYM_MAP.get(t);
    if (syns) {
      for (const s of syns) out.push(s);
    }
  }
  return out;
}

function charNgrams(token: string, n = 3): string[] {
  if (token.length < n) return token.length ? [`#${token}`] : [];
  const grams: string[] = [];
  const padded = `#${token}#`;
  for (let i = 0; i <= padded.length - n; i++) {
    grams.push(padded.slice(i, i + n));
  }
  return grams;
}

/**
 * Project text into a unit vector.
 * Similar vocabulary / stems / synonyms → high cosine; unrelated → low.
 */
export function localEmbed(text: string, dimensions: number): number[] {
  const dims = Math.max(1, Math.min(Math.floor(dimensions), 1024));
  const vec = new Array<number>(dims).fill(0);
  const base = tokenize(text, { stopwords: true, stemming: true });
  if (!base.length) return vec;

  const tokens = expandTokens(base);
  // Unigrams (weight 1) + bigrams (0.6) + char trigrams (0.35)
  const features: Array<{ key: string; w: number }> = [];
  for (const t of tokens) {
    features.push({ key: `u:${t}`, w: 1 });
    for (const g of charNgrams(t, 3)) {
      features.push({ key: `c:${g}`, w: 0.35 });
    }
  }
  for (let i = 0; i < tokens.length - 1; i++) {
    features.push({ key: `b:${tokens[i]}_${tokens[i + 1]}`, w: 0.6 });
  }

  for (const { key, w } of features) {
    // Multi-hash (signed projection) reduces collision noise
    for (let salt = 0; salt < 3; salt++) {
      const h = hash32(key, salt * 0x9e3779b9);
      const idx = h % dims;
      const sign = h & 1 ? 1 : -1;
      vec[idx]! += sign * w * (1 / (salt + 1));
    }
  }

  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dims; i++) vec[i]! /= norm;
  return vec;
}

/** Prefer title/body for embedding; skip field-name pollution and non-text. */
export function textFromFields(fields: Record<string, unknown>): string {
  const prefer = ["title", "name", "body", "description", "content", "text", "summary"];
  const parts: string[] = [];
  for (const key of prefer) {
    const v = fields[key];
    if (typeof v === "string" && v.trim()) {
      // Title gets repeated so it dominates the vector
      const weight = key === "title" || key === "name" ? 3 : 1;
      for (let i = 0; i < weight; i++) parts.push(v);
    }
  }
  for (const [k, v] of Object.entries(fields)) {
    if (prefer.includes(k)) continue;
    if (k === "url" || k === "location" || k === "status") continue;
    if (typeof v === "string" && v.trim()) parts.push(v);
  }
  return parts.join(" ");
}

/** Relative floor so weak cosine noise does not flood result lists. */
export function meaningfulVectorHits(
  scored: Array<{ id: string; score: number }>,
  opts?: { minAbsolute?: number; relativeOfBest?: number; topK?: number },
): Array<{ id: string; score: number }> {
  if (!scored.length) return [];
  const minAbsolute = opts?.minAbsolute ?? 0.2;
  const relativeOfBest = opts?.relativeOfBest ?? 0.55;
  const best = scored[0]!.score;
  const floor = Math.max(minAbsolute, best * relativeOfBest);
  const kept = scored.filter((r) => r.score >= floor);
  return kept.slice(0, opts?.topK ?? kept.length);
}
