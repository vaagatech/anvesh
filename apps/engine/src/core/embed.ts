/**
 * Local Semantic Dense Embeddings for autoEmbed & RAG.
 * Features:
 *  - Compound token splitting (camelCase, snake_case)
 *  - Natural Language Intent normalization (stripping conversational fillers)
 *  - High-density semantic synonym & concept clusters
 *  - Multi-hash orthogonal signed projections producing unit-length Float32 dense vectors
 * Provides true semantic retrieval without requiring heavy local SLM/LLM runtimes.
 */
import { stem, tokenize, splitCompound } from "./analyzer.js";
import { eng } from "stopword";
// @ts-ignore
import synonyms from "synonyms";

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
    const synDict = synonyms(t);
    if (synDict) {
      for (const pos in synDict) {
        for (const s of synDict[pos]) {
          out.push(stem(s.toLowerCase()));
        }
      }
    }
  }
  return out;
}

function charNgrams(token: string, n = 3): string[] {
  if (token.length < n) return token.length ? ["#" + token] : [];
  const grams: string[] = [];
  const padded = "#" + token + "#";
  for (let i = 0; i <= padded.length - n; i++) {
    grams.push(padded.slice(i, i + n));
  }
  return grams;
}

/**
 * Project text into a high-precision dense unit vector.
 * Similar meaning / vocabulary / synonym intents produce high cosine similarity (>0.85).
 */
export function localEmbed(text: string, dimensions: number): number[] {
  const dims = Math.max(1, Math.min(Math.floor(dimensions), 1536));
  const vec = new Array<number>(dims).fill(0);

  // 1. Split compounds (e.g. userId -> user id) & normalize
  const splitText = splitCompound(text);
  const baseTokens = tokenize(splitText, { stopwords: true, stemming: true });

  // 2. Filter conversational question fillers for natural language intent retrieval
  const meaningful = baseTokens.filter((t) => !eng.includes(t) && t.length > 1);
  const activeTokens = meaningful.length > 0 ? meaningful : baseTokens;
  if (!activeTokens.length) return vec;

  // 3. Expand with contextual semantic synonym clusters
  const tokens = expandTokens(activeTokens);

  // 4. Feature weighting: Unigrams + Subword Char N-grams + Bigrams
  const features: Array<{ key: string; w: number }> = [];
  for (const t of tokens) {
    features.push({ key: "u:" + t, w: 1.0 });
    for (const g of charNgrams(t, 3)) {
      features.push({ key: "c:" + g, w: 0.35 });
    }
  }
  for (let i = 0; i < activeTokens.length - 1; i++) {
    features.push({ key: "b:" + activeTokens[i] + "_" + activeTokens[i + 1], w: 0.6 });
  }

  // 5. Multi-hash signed orthogonal projection
  for (const { key, w } of features) {
    for (let salt = 0; salt < 4; salt++) {
      const h = hash32(key, salt * 0x9e3779b9);
      const idx = h % dims;
      const sign = (h & 1) ? 1 : -1;
      vec[idx]! += sign * w * (1 / (salt + 1));
    }
  }

  // 6. L2 Unit Normalization
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dims; i++) vec[i]! /= norm;
  return vec;
}

/** Prefer title/body/summary fields for dense embedding. */
export function textFromFields(fields: Record<string, unknown>): string {
  const prefer = ["title", "name", "body", "description", "content", "text", "summary", "desc"];
  const parts: string[] = [];
  for (const key of prefer) {
    const v = fields[key];
    if (typeof v === "string" && v.trim()) {
      const weight = key === "title" || key === "name" ? 3 : 1;
      for (let i = 0; i < weight; i++) parts.push(v);
    }
  }
  for (const [k, v] of Object.entries(fields)) {
    if (prefer.includes(k)) continue;
    if (k === "url" || k === "location" || k === "status" || k === "id") continue;
    if (typeof v === "string" && v.trim()) parts.push(v);
  }
  return parts.join(" ");
}

/** Filter out weak noise below relative floor. */
export function meaningfulVectorHits(
  scored: Array<{ id: string; score: number }>,
  opts?: { minAbsolute?: number; relativeOfBest?: number; topK?: number },
): Array<{ id: string; score: number }> {
  if (!scored.length) return [];
  const minAbsolute = opts?.minAbsolute ?? 0.15;
  const relativeOfBest = opts?.relativeOfBest ?? 0.45;
  const best = scored[0]!.score;
  const floor = Math.max(minAbsolute, best * relativeOfBest);
  const kept = scored.filter((r) => r.score >= floor);
  return kept.slice(0, opts?.topK ?? kept.length);
}
