import { describe, expect, it } from "vitest";
import {
  VectorStore,
  cosineSimilarity,
  dotProduct,
  euclideanSimilarity,
  quantizeVector,
  dequantizeVector,
} from "../src/core/vector-store.js";

describe("VectorStore & Metrics", () => {
  it("computes cosine, dot product, and euclidean metrics", () => {
    const v1 = Float32Array.from([1, 0, 0]);
    const v2 = Float32Array.from([0, 1, 0]);
    const v3 = Float32Array.from([1, 0, 0]);

    expect(cosineSimilarity(v1, v3)).toBeCloseTo(1.0);
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(0.0);

    expect(dotProduct(v1, v3)).toBeCloseTo(1.0);
    expect(dotProduct(v1, v2)).toBeCloseTo(0.0);

    expect(euclideanSimilarity(v1, v3)).toBeCloseTo(1.0);
    expect(euclideanSimilarity(v1, v2)).toBeCloseTo(1 / (1 + Math.SQRT2));
  });

  it("supports SQ8 quantization and dequantization", () => {
    const orig = Float32Array.from([0.12, -0.45, 0.88, 0.05]);
    const q = quantizeVector(orig);
    const deq = dequantizeVector(q);

    expect(q.quantized.length).toBe(4);
    expect(deq[0]).toBeCloseTo(orig[0]!, 1);
    expect(deq[2]).toBeCloseTo(orig[2]!, 1);
  });

  it("performs multi-metric vector search on VectorStore", () => {
    const store = new VectorStore(3, "dot_product");
    store.upsert("doc1", [1.0, 0.0, 0.0]);
    store.upsert("doc2", [0.0, 2.0, 0.0]);
    store.upsert("doc3", [0.5, 0.5, 0.0]);

    const res = store.search([1.0, 0.0, 0.0], { topK: 2 });
    expect(res.length).toBe(2);
    expect(res[0]!.id).toBe("doc1");
    expect(res[0]!.score).toBe(1.0);
  });

  it("supports HNSW graph ANN vector search", () => {
    const store = new VectorStore(3, "cosine", "hnsw");
    store.upsert("doc1", [1, 0, 0]);
    store.upsert("doc2", [0, 1, 0]);
    store.upsert("doc3", [0.9, 0.1, 0]);

    const res = store.search([1, 0, 0], { topK: 2 });
    expect(res.length).toBeGreaterThan(0);
    expect(res[0]!.id).toBe("doc1");
  });
});
