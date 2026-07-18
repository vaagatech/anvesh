import { describe, it, expect, beforeEach } from "vitest";
import { AnveshEngine } from "../src/core/engine.js";
import { MemoryStorage } from "../src/storage/memory.js";
import { tokenize, stem } from "../src/core/analyzer.js";
import { cosineSimilarity } from "../src/core/vector-store.js";
import { formatMessage } from "../src/messaging/vaakly.js";

describe("analyzer", () => {
  it("tokenizes and stems", () => {
    const tokens = tokenize("Searching for running shoes");
    expect(tokens).toContain("search");
    expect(tokens).toContain("run");
    expect(tokens).toContain("shoe");
  });

  it("stems plurals", () => {
    expect(stem("documents")).toBe("document");
  });
});

describe("messaging", () => {
  it("formats meaningful user messages", () => {
    const m = formatMessage("OK_SEARCH", { total: 3, tookMs: 12, mode: "keyword" });
    expect(m.message).toContain("3 matching document");
    expect(m.logLine).toContain("search.ok");
  });
});

describe("vector cosine", () => {
  it("scores identical vectors as 1", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });
});

describe("AnveshEngine", () => {
  let engine: AnveshEngine;

  beforeEach(async () => {
    engine = new AnveshEngine(new MemoryStorage());
    await engine.init();
    await engine.createIndex(
      "products",
      {
        title: { type: "text" },
        description: { type: "text" },
        category: { type: "keyword" },
        price: { type: "number" },
      },
      { vectorDimensions: 3, hybridKeywordWeight: 0.5 },
    );
  });

  it("indexes and keyword-searches", async () => {
    await engine.indexDocument("products", {
      id: "1",
      fields: {
        title: "Red running shoes",
        description: "Lightweight trail runners",
        category: "footwear",
        price: 89,
      },
    });
    await engine.indexDocument("products", {
      id: "2",
      fields: {
        title: "Blue ceramic mug",
        description: "Coffee cup",
        category: "kitchen",
        price: 12,
      },
    });

    const result = engine.search("products", { q: "running shoes", mode: "keyword" });
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.hits[0]?.id).toBe("1");
    expect(result.message).toMatch(/Search completed/i);
  });

  it("supports semantic search", async () => {
    await engine.indexDocument("products", {
      id: "a",
      fields: { title: "Trail runner", description: "shoes", category: "footwear", price: 100 },
      vector: [1, 0, 0],
    });
    await engine.indexDocument("products", {
      id: "b",
      fields: { title: "Mug", description: "cup", category: "kitchen", price: 10 },
      vector: [0, 1, 0],
    });

    const result = engine.search("products", {
      vector: [0.9, 0.1, 0],
      mode: "semantic",
    });
    expect(result.hits[0]?.id).toBe("a");
  });

  it("supports hybrid search and filters", async () => {
    await engine.indexDocument("products", {
      id: "1",
      fields: { title: "Running shoe", description: "fast", category: "footwear", price: 80 },
      vector: [1, 0, 0],
    });
    await engine.indexDocument("products", {
      id: "2",
      fields: { title: "Running belt", description: "accessory", category: "gear", price: 25 },
      vector: [0.8, 0.2, 0],
    });

    const result = engine.search("products", {
      q: "running",
      vector: [1, 0, 0],
      mode: "hybrid",
      filters: [{ field: "category", value: "footwear" }],
    });
    expect(result.hits.every((h) => h.source.fields.category === "footwear")).toBe(true);
  });

  it("bulk indexes and deletes", async () => {
    const bulk = await engine.bulkIndex("products", [
      { id: "x", fields: { title: "Alpha", description: "a", category: "a", price: 1 } },
      { id: "y", fields: { title: "Beta", description: "b", category: "b", price: 2 } },
    ]);
    expect(bulk.indexed).toBe(2);
    await engine.deleteDocument("products", "x");
    expect(() => engine.getDocument("products", "x")).toThrow();
  });
});
