/**
 * Dense vector store — cosine similarity with optional brute-force top-k.
 * For larger corpora, pair with an ANN service; this stays Lambda-friendly.
 */

import type { DocumentId } from "../types.js";
import { AnveshError } from "../messaging/vaakly.js";

export interface VectorRecord {
  id: DocumentId;
  vector: Float32Array;
}

export interface VectorStoreSnapshot {
  dimensions: number;
  vectors: Record<string, number[]>;
}

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

export class VectorStore {
  private vectors = new Map<DocumentId, Float32Array>();

  constructor(public readonly dimensions: number) {
    if (dimensions <= 0) {
      throw new AnveshError("ERR_VALIDATION", { detail: "vectorDimensions must be > 0" });
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
    this.vectors.set(id, Float32Array.from(vector));
  }

  remove(id: DocumentId): boolean {
    return this.vectors.delete(id);
  }

  has(id: DocumentId): boolean {
    return this.vectors.has(id);
  }

  get(id: DocumentId): Float32Array | undefined {
    return this.vectors.get(id);
  }

  search(
    query: number[],
    options: { topK?: number; candidates?: Set<DocumentId>; minScore?: number } = {},
  ): Array<{ id: DocumentId; score: number }> {
    if (query.length !== this.dimensions) {
      throw new AnveshError("ERR_VECTOR_DIM", {
        expected: this.dimensions,
        received: query.length,
      });
    }
    const q = Float32Array.from(query);
    const minScore = options.minScore ?? -1;
    const scored: Array<{ id: DocumentId; score: number }> = [];

    for (const [id, vec] of this.vectors) {
      if (options.candidates && !options.candidates.has(id)) continue;
      const score = cosineSimilarity(q, vec);
      if (score >= minScore) scored.push({ id, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, options.topK ?? 10);
  }

  toSnapshot(): VectorStoreSnapshot {
    const vectors: Record<string, number[]> = {};
    for (const [id, vec] of this.vectors) {
      vectors[id] = Array.from(vec);
    }
    return { dimensions: this.dimensions, vectors };
  }

  static fromSnapshot(snapshot: VectorStoreSnapshot): VectorStore {
    const store = new VectorStore(snapshot.dimensions);
    for (const [id, vec] of Object.entries(snapshot.vectors)) {
      store.vectors.set(id, Float32Array.from(vec));
    }
    return store;
  }
}
