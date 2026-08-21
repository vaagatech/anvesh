import { describe, it, expect, beforeEach } from "vitest";
import {
  LocalEmbeddingAdapter,
  CustomHttpEmbeddingAdapter,
  createEmbeddingAdapter,
} from "../src/core/embedding-adapters.js";
import { AnveshEngine } from "../src/core/engine.js";
import { MemoryStorage } from "../src/storage/memory.js";

describe("Pluggable Embedding Adapters", () => {
  it("uses LocalEmbeddingAdapter by default without any LLM or external calls", async () => {
    const adapter = createEmbeddingAdapter();
    expect(adapter.provider).toBe("local");

    const vec = await adapter.embed("silk saree with elephant motifs", 128);
    expect(vec.length).toBe(128);

    // Magnitude should be ~1 (unit vector)
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 4);

    const batch = await adapter.embedBatch(["saree", "kurti", "lehenga"], 64);
    expect(batch.length).toBe(3);
    expect(batch[0]?.length).toBe(64);
  });

  it("creates LocalEmbeddingAdapter explicitly via config", async () => {
    const adapter = createEmbeddingAdapter({ provider: "local", dimensions: 256 });
    expect(adapter.provider).toBe("local");
    const vec = await adapter.embed("kanjivaram silk", 256);
    expect(vec.length).toBe(256);
  });

  it("handles CustomHttpEmbeddingAdapter with mock endpoint", async () => {
    const adapter = new CustomHttpEmbeddingAdapter({
      endpoint: "http://mock-embedding-service:8000/embed",
      dimensions: 128,
    });
    expect(adapter.provider).toBe("custom");
  });
});

describe("AnveshEngine with Pluggable Embedding Config", () => {
  let engine: AnveshEngine;

  beforeEach(async () => {
    engine = new AnveshEngine(new MemoryStorage());
    await engine.init();
    await engine.createIndex("catalog", {
      name: { type: "text" },
      description: { type: "text" },
    }, {
      vectorDimensions: 256,
      autoEmbed: true,
      embeddingConfig: {
        provider: "local",
        dimensions: 256,
      },
    });
  });

  it("indexes and performs semantic search using pluggable local adapter without LLM", async () => {
    await engine.indexDocument("catalog", {
      id: "doc-1",
      fields: {
        title: "Kanjivaram Silk Saree",
        body: "Traditional handwoven wedding silk garment with golden zari motifs.",
      },
    });

    await engine.indexDocument("catalog", {
      id: "doc-2",
      fields: {
        title: "Cotton Casual Shirt",
        body: "Office wear breathable fabric.",
      },
    });

    const res = await engine.search("catalog", {
      q: "wedding silk garment",
      mode: "semantic",
    });

    expect(res.hits.length).toBeGreaterThan(0);
    // doc-1 (silk saree) should be ranked first
    expect(res.hits[0]?.id).toBe("doc-1");
  });
});
