/**
 * Dense Vector Store & Vector DB Engine — supporting multi-metric similarity,
 * HNSW ANN graph indexing, SQ8 scalar quantization, and candidates pre-filtering.
 * Built for microsecond-to-millisecond performance in Node.js.
 */

import type { DocumentId, VectorMetric, VectorIndexType, VectorQuantization } from "../types.js";
import { AnveshError } from "../messaging/vaakly.js";

export interface VectorRecord {
  id: DocumentId;
  vector: Float32Array;
}

export interface VectorStoreSnapshot {
  dimensions: number;
  metric?: VectorMetric;
  indexType?: VectorIndexType;
  quantization?: VectorQuantization;
  vectors: Record<string, number[]>;
}

/** Cosine similarity score [-1, 1] */
export function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Un-normalized dot product */
export function dotProduct(a: Float32Array | number[], b: Float32Array | number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
  }
  return dot;
}

/** Euclidean distance converted to similarity score in (0, 1] where 1 is identical */
export function euclideanSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  const n = Math.min(a.length, b.length);
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const diff = a[i]! - b[i]!;
    sumSq += diff * diff;
  }
  const dist = Math.sqrt(sumSq);
  return 1 / (1 + dist);
}

/** General distance metric score calculation */
export function computeVectorSimilarity(
  a: Float32Array | number[],
  b: Float32Array | number[],
  metric: VectorMetric = "cosine",
): number {
  switch (metric) {
    case "dot_product":
      return dotProduct(a, b);
    case "euclidean":
      return euclideanSimilarity(a, b);
    case "cosine":
    default:
      return cosineSimilarity(a, b);
  }
}

/** Scalar Quantization (SQ8) container for 8-bit compressed vectors */
export interface QuantizedVector {
  quantized: Int8Array;
  min: number;
  scale: number;
}

export function quantizeVector(vec: Float32Array): QuantizedVector {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < vec.length; i++) {
    const val = vec[i]!;
    if (val < min) min = val;
    if (val > max) max = val;
  }
  const range = max - min || 1;
  const scale = 255 / range;
  const quantized = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    quantized[i] = Math.round((vec[i]! - min) * scale) - 128;
  }
  return { quantized, min, scale };
}

export function dequantizeVector(q: QuantizedVector): Float32Array {
  const out = new Float32Array(q.quantized.length);
  const invScale = 1 / q.scale;
  for (let i = 0; i < q.quantized.length; i++) {
    out[i] = (q.quantized[i]! + 128) * invScale + q.min;
  }
  return out;
}

/** HNSW (Hierarchical Navigable Small World) node structure */
interface HNSWNode {
  id: DocumentId;
  vector: Float32Array;
  level: number;
  neighbors: DocumentId[][]; // per layer
}

/** Lightweight HNSW ANN graph index */
export class HNSWGraphIndex {
  private nodes = new Map<DocumentId, HNSWNode>();
  private entryPointId: DocumentId | null = null;
  private maxLevel = 0;
  private readonly M = 16;
  private readonly efConstruction = 64;
  private readonly efSearch = 32;

  constructor(
    public readonly dimensions: number,
    public readonly metric: VectorMetric = "cosine",
  ) {}

  get size(): number {
    return this.nodes.size;
  }

  private getRandomLevel(): number {
    let level = 0;
    const ml = 1 / Math.log(this.M);
    while (Math.random() < 0.5 && level < 16) {
      level++;
    }
    return level;
  }

  upsert(id: DocumentId, vector: Float32Array): void {
    if (this.nodes.has(id)) {
      this.remove(id);
    }
    const level = this.getRandomLevel();
    const neighbors: DocumentId[][] = Array.from({ length: level + 1 }, () => []);
    const node: HNSWNode = { id, vector, level, neighbors };
    this.nodes.set(id, node);

    if (!this.entryPointId) {
      this.entryPointId = id;
      this.maxLevel = level;
      return;
    }

    let curr = this.entryPointId;
    let currDist = computeVectorSimilarity(vector, this.nodes.get(curr)!.vector, this.metric);

    // Greedy search top layers
    for (let l = this.maxLevel; l > level; l--) {
      let changed = true;
      while (changed) {
        changed = false;
        const currNode = this.nodes.get(curr)!;
        const layerNeighbors = currNode.neighbors[l] ?? [];
        for (const neighborId of layerNeighbors) {
          const neighborNode = this.nodes.get(neighborId);
          if (!neighborNode) continue;
          const score = computeVectorSimilarity(vector, neighborNode.vector, this.metric);
          if (score > currDist) {
            currDist = score;
            curr = neighborId;
            changed = true;
          }
        }
      }
    }

    // Connect layers up to `level`
    for (let l = Math.min(level, this.maxLevel); l >= 0; l--) {
      const candidates = this.searchLayer(vector, curr, this.efConstruction, l);
      const chosen = candidates.slice(0, this.M);

      for (const candidate of chosen) {
        let nodeLayer = node.neighbors[l];
        if (!nodeLayer) {
          nodeLayer = [];
          node.neighbors[l] = nodeLayer;
        }
        nodeLayer.push(candidate.id);

        const candNode = this.nodes.get(candidate.id);
        if (candNode) {
          const candLayer = candNode.neighbors[l];
          if (candLayer) {
            candLayer.push(id);
            if (candLayer.length > this.M * 2) {
              candNode.neighbors[l] = candLayer.slice(0, this.M);
            }
          }
        }
      }
      if (chosen.length > 0) {
        curr = chosen[0]!.id;
      }
    }

    if (level > this.maxLevel) {
      this.maxLevel = level;
      this.entryPointId = id;
    }
  }

  remove(id: DocumentId): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;

    // Disconnect neighbors
    for (let l = 0; l <= node.level; l++) {
      const neighborsAtLevel = node.neighbors[l];
      if (neighborsAtLevel) {
        for (const neighborId of neighborsAtLevel) {
          const neighborNode = this.nodes.get(neighborId);
          if (neighborNode) {
            const list = neighborNode.neighbors[l];
            if (list) {
              neighborNode.neighbors[l] = list.filter((nId) => nId !== id);
            }
          }
        }
      }
    }

    this.nodes.delete(id);
    if (this.entryPointId === id) {
      this.entryPointId = this.nodes.keys().next().value ?? null;
      if (!this.entryPointId) this.maxLevel = 0;
    }
    return true;
  }

  private searchLayer(
    query: Float32Array,
    entryPointId: DocumentId,
    ef: number,
    level: number,
    candidatesFilter?: Set<DocumentId>,
  ): Array<{ id: DocumentId; score: number }> {
    const visited = new Set<DocumentId>([entryPointId]);
    const entryNode = this.nodes.get(entryPointId)!;
    const entryScore = computeVectorSimilarity(query, entryNode.vector, this.metric);
    const results: Array<{ id: DocumentId; score: number }> = [];

    if (!candidatesFilter || candidatesFilter.has(entryPointId)) {
      results.push({ id: entryPointId, score: entryScore });
    }

    const queue: Array<{ id: DocumentId; score: number }> = [{ id: entryPointId, score: entryScore }];

    while (queue.length > 0) {
      queue.sort((a, b) => b.score - a.score);
      const curr = queue.shift()!;
      const currNode = this.nodes.get(curr.id);
      if (!currNode) continue;

      const neighbors = currNode.neighbors[level] ?? [];
      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const neighborNode = this.nodes.get(neighborId);
        if (!neighborNode) continue;

        const score = computeVectorSimilarity(query, neighborNode.vector, this.metric);
        if (!candidatesFilter || candidatesFilter.has(neighborId)) {
          results.push({ id: neighborId, score });
        }
        queue.push({ id: neighborId, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, ef);
  }

  search(
    query: Float32Array,
    topK: number,
    candidatesFilter?: Set<DocumentId>,
  ): Array<{ id: DocumentId; score: number }> {
    if (!this.entryPointId || this.nodes.size === 0) return [];
    return this.searchLayer(
      query,
      this.entryPointId,
      Math.max(topK, this.efSearch),
      0,
      candidatesFilter,
    ).slice(0, topK);
  }
}

export class VectorStore {
  private vectors = new Map<DocumentId, Float32Array>();
  private quantizedVectors = new Map<DocumentId, QuantizedVector>();
  private hnswIndex: HNSWGraphIndex | null = null;

  constructor(
    public readonly dimensions: number,
    public readonly metric: VectorMetric = "cosine",
    public readonly indexType: VectorIndexType = "flat",
    public readonly quantization: VectorQuantization = "none",
  ) {
    if (dimensions <= 0) {
      throw new AnveshError("ERR_VALIDATION", { detail: "vectorDimensions must be > 0" });
    }
    if (this.indexType === "hnsw") {
      this.hnswIndex = new HNSWGraphIndex(this.dimensions, this.metric);
    }
  }

  get size(): number {
    return this.vectors.size;
  }

  upsert(id: DocumentId, vector: number[]): void {
    if (vector.length !== this.dimensions) {
      throw new AnveshError("ERR_VECTOR_DIM", {
        expected: this.dimensions,
        received: vector.length,
      });
    }
    const f32 = Float32Array.from(vector);
    this.vectors.set(id, f32);

    if (this.quantization === "sq8") {
      this.quantizedVectors.set(id, quantizeVector(f32));
    }
    if (this.hnswIndex) {
      this.hnswIndex.upsert(id, f32);
    }
  }

  remove(id: DocumentId): boolean {
    const deleted = this.vectors.delete(id);
    this.quantizedVectors.delete(id);
    if (this.hnswIndex) {
      this.hnswIndex.remove(id);
    }
    return deleted;
  }

  has(id: DocumentId): boolean {
    return this.vectors.has(id);
  }

  get(id: DocumentId): Float32Array | undefined {
    return this.vectors.get(id);
  }

  search(
    query: number[],
    options: {
      topK?: number;
      candidates?: Set<DocumentId>;
      minScore?: number;
      metric?: VectorMetric;
    } = {},
  ): Array<{ id: DocumentId; score: number }> {
    if (query.length !== this.dimensions) {
      throw new AnveshError("ERR_VECTOR_DIM", {
        expected: this.dimensions,
        received: query.length,
      });
    }
    const q = Float32Array.from(query);
    const topK = options.topK ?? 10;
    const minScore = options.minScore ?? -1;
    const metric = options.metric ?? this.metric;
    const candidates = options.candidates;

    // Use HNSW search if indexType is hnsw and no custom candidate set is applied (or small candidate set)
    if (this.hnswIndex && (!candidates || candidates.size > 50)) {
      const hnswHits = this.hnswIndex.search(q, topK, candidates);
      return hnswHits.filter((h) => h.score >= minScore);
    }

    // Flat brute-force or SQ8 quantized scan
    const scored: Array<{ id: DocumentId; score: number }> = [];

    if (candidates && candidates.size < this.vectors.size / 2) {
      for (const id of candidates) {
        const qVec = this.quantizedVectors.get(id);
        const vec = this.vectors.get(id);
        if (!vec && !qVec) continue;
        const score = qVec
          ? computeVectorSimilarity(q, dequantizeVector(qVec), metric)
          : computeVectorSimilarity(q, vec!, metric);
        if (score >= minScore) scored.push({ id, score });
      }
    } else if (this.quantization === "sq8" && this.quantizedVectors.size === this.vectors.size) {
      for (const [id, qVec] of this.quantizedVectors) {
        if (candidates && !candidates.has(id)) continue;
        const dequantized = dequantizeVector(qVec);
        const score = computeVectorSimilarity(q, dequantized, metric);
        if (score >= minScore) scored.push({ id, score });
      }
    } else {
      for (const [id, vec] of this.vectors) {
        if (candidates && !candidates.has(id)) continue;
        const score = computeVectorSimilarity(q, vec, metric);
        if (score >= minScore) scored.push({ id, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  toSnapshot(): VectorStoreSnapshot {
    const vectors: Record<string, number[]> = {};
    for (const [id, vec] of this.vectors) {
      vectors[id] = Array.from(vec);
    }
    return {
      dimensions: this.dimensions,
      metric: this.metric,
      indexType: this.indexType,
      quantization: this.quantization,
      vectors,
    };
  }

  static fromSnapshot(snapshot: VectorStoreSnapshot): VectorStore {
    const store = new VectorStore(
      snapshot.dimensions,
      snapshot.metric ?? "cosine",
      snapshot.indexType ?? "flat",
      snapshot.quantization ?? "none",
    );
    for (const [id, vec] of Object.entries(snapshot.vectors)) {
      store.upsert(id, vec);
    }
    return store;
  }
}
