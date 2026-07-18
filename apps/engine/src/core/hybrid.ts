/**
 * Hybrid ranking — blend BM25 and cosine similarity with min-max normalization.
 */

import type { DocumentId, SearchHit, AnveshDocument } from "../types.js";

export function minMaxNormalize(scores: Map<DocumentId, number>): Map<DocumentId, number> {
  if (scores.size === 0) return scores;
  let min = Infinity;
  let max = -Infinity;
  for (const v of scores.values()) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  const out = new Map<DocumentId, number>();
  for (const [id, v] of scores) {
    out.set(id, range === 0 ? (max === 0 ? 0 : 1) : (v - min) / range);
  }
  return out;
}

export function blendScores(
  keyword: Map<DocumentId, number>,
  semantic: Map<DocumentId, number>,
  keywordWeight: number,
  documents: Map<DocumentId, AnveshDocument>,
): SearchHit[] {
  const kw = minMaxNormalize(keyword);
  const sem = minMaxNormalize(semantic);
  const ids = new Set<DocumentId>([...kw.keys(), ...sem.keys()]);
  const w = Math.min(1, Math.max(0, keywordWeight));
  const hits: SearchHit[] = [];

  for (const id of ids) {
    const doc = documents.get(id);
    if (!doc) continue;
    const score = w * (kw.get(id) ?? 0) + (1 - w) * (sem.get(id) ?? 0);
    hits.push({ id, score, source: doc });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits;
}
