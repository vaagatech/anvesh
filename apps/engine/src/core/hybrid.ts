/**
 * Hybrid ranking — blend BM25 and vector similarity using min-max linear weighting
 * or Reciprocal Rank Fusion (RRF).
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

/**
 * Reciprocal Rank Fusion (RRF) algorithm:
 * RRF_score(d) = sum(1 / (k + rank(d, r))) across all rank lists r.
 */
export function reciprocalRankFusion(
  keywordScores: Map<DocumentId, number>,
  semanticScores: Map<DocumentId, number>,
  rrfK = 60,
  documents: Map<DocumentId, AnveshDocument>,
): SearchHit[] {
  // Sort keyword IDs by score desc
  const sortedKeyword = [...keywordScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  // Sort semantic IDs by score desc
  const sortedSemantic = [...semanticScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  const rrfScores = new Map<DocumentId, number>();

  sortedKeyword.forEach((id, index) => {
    const rank = index + 1;
    const current = rrfScores.get(id) ?? 0;
    rrfScores.set(id, current + 1 / (rrfK + rank));
  });

  sortedSemantic.forEach((id, index) => {
    const rank = index + 1;
    const current = rrfScores.get(id) ?? 0;
    rrfScores.set(id, current + 1 / (rrfK + rank));
  });

  const hits: SearchHit[] = [];
  for (const [id, score] of rrfScores) {
    const doc = documents.get(id);
    if (!doc) continue;
    hits.push({ id, score, source: doc });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits;
}
