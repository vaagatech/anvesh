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

  it("supports multilingual E5-small for cross-lingual and Indic/Unicode script queries", async () => {
    const e5Adapter = new MicroTransformerEmbeddingAdapter({
      model: "multilingual-e5-small",
      dimensions: 384,
    });
    expect(e5Adapter.isMultilingual).toBe(true);

    // Test with Tamil, Hindi, and English text
    const vecTamil = await e5Adapter.embed("query: பட்டு புடவை யானை உருவம்", 384);
    const vecHindi = await e5Adapter.embed("query: रेशम साड़ी हाथी रूपांकन", 384);
    const vecEnglish = await e5Adapter.embed("passage: Pure silk saree with elephant border", 384);

    expect(vecTamil.length).toBe(384);
    expect(vecHindi.length).toBe(384);
    expect(vecEnglish.length).toBe(384);
  });

  it("dynamically resolves vector dimensions when creating index without hardcoded dimension numbers", async () => {
    // 1. Index with Gemini adapter -> automatically 768 dimensions
    const geminiIndex = await engine.createIndex("gemini_catalog", {
      title: { type: "text" },
    }, {
      embeddingConfig: { provider: "gemini", apiKey: "mock-key" },
    });
    expect(geminiIndex.settings?.vectorDimensions).toBe(768);

    // 2. Index with Orthogonal adapter -> automatically 512 dimensions
    const orthoIndex = await engine.createIndex("ortho_catalog", {
      title: { type: "text" },
    }, {
      embeddingConfig: { provider: "orthogonal" },
    });
    expect(orthoIndex.settings?.vectorDimensions).toBe(512);

    // 3. Index with OpenAI adapter -> automatically 1536 dimensions
    const openaiIndex = await engine.createIndex("openai_catalog", {
      title: { type: "text" },
    }, {
      embeddingConfig: { provider: "openai", apiKey: "mock-key" },
    });
    expect(openaiIndex.settings?.vectorDimensions).toBe(1536);

    // 4. Default index -> automatically 384 dimensions from MicroTransformer
    const defaultIndex = await engine.createIndex("default_catalog", {
      title: { type: "text" },
    });
    expect(defaultIndex.settings?.vectorDimensions).toBe(384);
  });

  it("migrates existing index with 512-d orthogonal vectors to new 384-d transformer vectors in-place", async () => {
    await engine.createIndex("legacy_store", {
      title: { type: "text" },
      body: { type: "text" },
    }, {
      vectorDimensions: 512,
      embeddingConfig: { provider: "orthogonal", dimensions: 512 },
    });

    await engine.indexDocument("legacy_store", {
      id: "prod-1",
      fields: { title: "Kanjivaram Saree", body: "Pure silk wedding saree with elephant motifs" },
    });

    await engine.indexDocument("legacy_store", {
      id: "prod-2",
      fields: { title: "Cotton Kurti", body: "Casual office daily wear" },
    });

    const preMigration = engine.getIndex("legacy_store");
    expect(preMigration?.settings?.vectorDimensions).toBe(512);

    // Run in-place vector migration to 384-d
    const migrationResult = await engine.migrateIndexVectors("legacy_store", {
      dimensions: 384,
      embeddingConfig: { provider: "micro-transformer" },
    });

    expect(migrationResult.ok).toBe(true);
    expect(migrationResult.migratedCount).toBe(2);
    expect(migrationResult.previousDimensions).toBe(512);
    expect(migrationResult.newDimensions).toBe(384);

    const postMigration = engine.getIndex("legacy_store");
    expect(postMigration?.settings?.vectorDimensions).toBe(384);

    // Verify semantic search works seamlessly on the migrated index
    const searchRes = await engine.search("legacy_store", {
      q: "wedding silk garment",
      mode: "semantic",
    });

    expect(searchRes.hits.length).toBeGreaterThan(0);
    expect(searchRes.hits[0]?.id).toBe("prod-1");
  });
});
