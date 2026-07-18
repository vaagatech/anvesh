/**
 * BM25 ranking — classic probabilistic IR, Elasticsearch-compatible defaults.
 */

export interface Bm25Params {
  k1?: number;
  b?: number;
}

export function idf(docFreq: number, docCount: number): number {
  // Lucene/Elasticsearch BM25 IDF variant
  const n = Math.max(docFreq, 0);
  const N = Math.max(docCount, 1);
  return Math.log(1 + (N - n + 0.5) / (n + 0.5));
}

export function bm25TermScore(
  tf: number,
  docLength: number,
  avgDocLength: number,
  docFreq: number,
  docCount: number,
  params: Bm25Params = {},
): number {
  const k1 = params.k1 ?? 1.2;
  const b = params.b ?? 0.75;
  const avg = avgDocLength > 0 ? avgDocLength : 1;
  const norm = 1 - b + b * (docLength / avg);
  const tfNorm = (tf * (k1 + 1)) / (tf + k1 * norm);
  return idf(docFreq, docCount) * tfNorm;
}
