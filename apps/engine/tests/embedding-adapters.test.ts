import { describe, it, expect, beforeEach } from "vitest";
import {
  MicroTransformerEmbeddingAdapter,
  OrthogonalEmbeddingAdapter,
  CustomHttpEmbeddingAdapter,
  createEmbeddingAdapter,
} from "../src/core/embedding-adapters.js";
import { AnveshEngine } from "../src/core/engine.js";
import { MemoryStorage } from "../src/storage/memory.js";

describe("Pluggable Embedding Adapters", () => {
  it("uses MicroTransformerEmbeddingAdapter by default without any external LLM or cloud API", async () => {
    const adapter = createEmbeddingAdapter();
    expect(adapter.provider).toBe("micro-transformer");

    const vec = await adapter.embed("silk saree with elephant motifs", 384);
    expect(vec.length).toBe(384);

    // Magnitude should be ~1 (unit vector)
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 4);

    const batch = await adapter.embedBatch(["saree", "kurti", "lehenga"], 384);
    expect(batch.length).toBe(3);
    expect(batch[0]?.length).toBe(384);
  });

  it("creates OrthogonalEmbeddingAdapter explicitly via config for zero-overhead projections", async () => {
    const adapter = createEmbeddingAdapter({ provider: "orthogonal", dimensions: 512 });
    expect(adapter.provider).toBe("orthogonal");
    const vec = await adapter.embed("kanjivaram silk", 512);
    expect(vec.length).toBe(512);
  });

  it("handles CustomHttpEmbeddingAdapter with mock endpoint", async () => {
    const adapter = new CustomHttpEmbeddingAdapter({
      endpoint: "http://mock-embedding-service:8000/embed",
      dimensions: 128,
    });
    expect(adapter.provider).toBe("custom");
  });
});

describe("AnveshEngine with Default Micro-Transformer & Orthogonal Config", () => {
  let engine: AnveshEngine;

  beforeEach(async () => {
    engine = new AnveshEngine(new MemoryStorage());
    await engine.init();
    await engine.createIndex("apparel", {
      title: { type: "text" },
      body: { type: "text" },
    }, {
      vectorDimensions: 384,
      autoEmbed: true,
      embeddingConfig: {
        provider: "micro-transformer",
        dimensions: 384,
      },
    });

    await engine.createIndex("fast_index", {
      title: { type: "text" },
      body: { type: "text" },
    }, {
      vectorDimensions: 256,
      autoEmbed: true,
      embeddingConfig: {
        provider: "orthogonal",
        dimensions: 256,
      },
    });
  });

  it("indexes and performs semantic search using default Micro Transformer", async () => {
    await engine.indexDocument("apparel", {
      id: "doc-1",
      fields: {
        title: "Kanjivaram Silk Saree",
        body: "Traditional handwoven wedding silk garment with golden zari motifs.",
      },
    });

    await engine.indexDocument("apparel", {
      id: "doc-2",
      fields: {
        title: "Cotton Casual Shirt",
        body: "Office wear breathable fabric.",
      },
    });

    const res = await engine.search("apparel", {
      q: "wedding silk garment",
      mode: "semantic",
    });

    expect(res.hits.length).toBeGreaterThan(0);
    expect(res.hits[0]?.id).toBe("doc-1");
  });

  it("indexes and performs semantic search using pure-CPU Orthogonal projections", async () => {
    await engine.indexDocument("fast_index", {
      id: "doc-1",
      fields: {
        title: "Kanjivaram Silk Saree",
        body: "Traditional handwoven wedding silk garment with golden zari motifs.",
      },
    });

    await engine.indexDocument("fast_index", {
      id: "doc-2",
      fields: {
        title: "Cotton Casual Shirt",
        body: "Office wear breathable fabric.",
      },
    });

    const res = await engine.search("fast_index", {
      q: "wedding silk garment",
      mode: "semantic",
    });

    expect(res.hits.length).toBeGreaterThan(0);
    expect(res.hits[0]?.id).toBe("doc-1");
  });
});
