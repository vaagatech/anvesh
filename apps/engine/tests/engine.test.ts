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
    expect(m.message).toBe("Search completed. Found 3 matching documents in 12ms.");
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

  it("fuzzy matches typos", async () => {
    await engine.indexDocument("products", {
      id: "1",
      fields: { title: "elephant shoes", description: "trail", category: "footwear", price: 10 },
    });
    const fuzzy = engine.search("products", {
      q: "elephent",
      mode: "keyword",
      fuzziness: 1,
    });
    expect(fuzzy.total).toBeGreaterThanOrEqual(1);
    expect(fuzzy.hits[0]?.id).toBe("1");
  });

  it("phrase and prefix search", async () => {
    await engine.indexDocument("products", {
      id: "1",
      fields: { title: "red running shoes", description: "x", category: "footwear", price: 10 },
    });
    await engine.indexDocument("products", {
      id: "2",
      fields: { title: "running red shoes", description: "y", category: "footwear", price: 11 },
    });
    const phrase = engine.search("products", {
      q: "red running",
      mode: "keyword",
      phrase: true,
    });
    expect(phrase.hits.some((h) => h.id === "1")).toBe(true);

    const prefix = engine.search("products", {
      q: "run",
      mode: "keyword",
      prefix: true,
    });
    expect(prefix.total).toBeGreaterThanOrEqual(1);
  });

  it("supports aliases and suggest", async () => {
    await engine.indexDocument("products", {
      id: "1",
      fields: { title: "catalog item", description: "x", category: "a", price: 1 },
    });
    engine.putAlias("catalog", "products");
    const viaAlias = engine.search("catalog", { q: "catalog", mode: "keyword" });
    expect(viaAlias.total).toBeGreaterThanOrEqual(1);
    const suggestions = engine.suggest("products", "cat");
    expect(suggestions.some((s) => s.startsWith("cat"))).toBe(true);
  });

  it("update-by-query sets fields", async () => {
    await engine.indexDocument("products", {
      id: "1",
      fields: { title: "item", description: "x", category: "old", price: 1 },
    });
    const res = await engine.updateByQuery("products", {
      filters: [{ field: "category", value: "old" }],
      set: { category: "new" },
    });
    expect(res.updated).toBe(1);
    expect(engine.getDocument("products", "1").fields.category).toBe("new");
  });
});

describe("dynamic mapping", () => {
  it("creates an index with empty mappings and learns fields on ingest", async () => {
    const engine = new AnveshEngine(new MemoryStorage());
    await engine.init();
    const def = await engine.createIndex("web", {});
    expect(def.settings?.dynamicMapping).toBe(true);
    expect(Object.keys(def.mappings)).toHaveLength(0);

    await engine.indexDocument("web", {
      id: "https://example.com/blog/hello",
      fields: {
        title: "Hello world",
        body: "A long enough body for text inference about running shoes.",
        url: "https://example.com/blog/hello",
        category: "blog",
        word_count: 12,
        published_at: "2026-01-15T10:00:00Z",
      },
    });

    const index = engine.getIndex("web");
    expect(index.mappings.title?.type).toBe("text");
    expect(index.mappings.url?.type).toBe("keyword");
    expect(index.mappings.category?.type).toBe("keyword");
    expect(index.mappings.word_count?.type).toBe("number");
    expect(index.mappings.published_at?.type).toBe("date");

    const result = engine.search("web", { q: "running shoes", mode: "keyword" });
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it("does not expand mappings when dynamicMapping is false", async () => {
    const engine = new AnveshEngine(new MemoryStorage());
    await engine.init();
    await engine.createIndex(
      "strict",
      { title: { type: "text" } },
      { dynamicMapping: false },
    );
    await engine.indexDocument("strict", {
      id: "1",
      fields: { title: "Hello", extra_tag: "ignored-for-postings" },
    });
    const index = engine.getIndex("strict");
    expect(index.mappings.extra_tag).toBeUndefined();
    expect(index.mappings.title?.type).toBe("text");
  });

  it("handles 'with' as conjunction and enforces AND matching", async () => {
    const engine = new AnveshEngine(new MemoryStorage());
    await engine.init();
    await engine.createIndex("apparel", {
      name: { type: "text" },
      description: { type: "text" },
    });

    await engine.indexDocument("apparel", {
      id: "doc-1",
      fields: {
        name: "Pure Kanjivaram Silk Saree",
        description: "Handcrafted pure silk saree with regal elephant motif and gold zari border.",
      },
    });

    await engine.indexDocument("apparel", {
      id: "doc-2",
      fields: {
        name: "Casual Cotton Saree",
        description: "Comfortable daily wear printed floral saree.",
      },
    });

    await engine.indexDocument("apparel", {
      id: "doc-3",
      fields: {
        name: "Brass Elephant Figurine",
        description: "Antique solid brass elephant statue for home decor.",
      },
    });

    // 1. Conjunction query "saree with elephant" -> Must match ONLY doc-1 (has both saree & elephant)
    const resWith = engine.search("apparel", { q: "saree with elephant", mode: "keyword" });
    expect(resWith.total).toBe(1);
    expect(resWith.hits[0]!.id).toBe("doc-1");

    // 2. Explicit operator: "AND" -> Must match ONLY doc-1
    const resAnd = engine.search("apparel", { q: "saree elephant", mode: "keyword", operator: "AND" });
    expect(resAnd.total).toBe(1);
    expect(resAnd.hits[0]!.id).toBe("doc-1");

    // 3. Explicit operator: "OR" -> Matches doc-1, doc-2, doc-3
    const resOr = engine.search("apparel", { q: "saree elephant", mode: "keyword", operator: "OR" });
    expect(resOr.total).toBe(3);
  });

  it("supports MongoDB-style field projections on search hits", async () => {
    const engine = new AnveshEngine(new MemoryStorage());
    await engine.init();
    await engine.createIndex("products", {
      title: { type: "text" },
      description: { type: "text" },
      category: { type: "keyword" },
      price: { type: "number" },
      stock: { type: "number" },
    });

    await engine.indexDocument("products", {
      id: "proj-1",
      fields: {
        title: "Mechanical Keyboard",
        description: "RGB clicky switches with hot swap PCB",
        category: "electronics",
        price: 129.99,
        stock: 50,
      },
      meta: {
        supplier: { name: "Keychron", location: "Global" },
        tags: ["gaming", "typing"],
      },
    });

    // 1. Inclusion projection: { title: 1, price: 1 }
    const resInc = engine.search("products", {
      q: "keyboard",
      projection: { title: 1, price: 1 },
    });
    expect(resInc.total).toBe(1);
    expect(resInc.hits[0]!.id).toBe("proj-1");
    expect(resInc.hits[0]!.source.fields).toEqual({
      title: "Mechanical Keyboard",
      price: 129.99,
    });
    expect(resInc.hits[0]!.source.meta).toBeUndefined();

    // 2. Exclusion projection: { description: 0, category: 0 }
    const resExc = engine.search("products", {
      q: "keyboard",
      projection: { description: 0, category: 0 },
    });
    expect(resExc.hits[0]!.source.fields.title).toBe("Mechanical Keyboard");
    expect(resExc.hits[0]!.source.fields.price).toBe(129.99);
    expect(resExc.hits[0]!.source.fields.stock).toBe(50);
    expect(resExc.hits[0]!.source.fields.description).toBeUndefined();
    expect(resExc.hits[0]!.source.fields.category).toBeUndefined();

    // 3. Nested projection: { title: 1, "meta.supplier.name": 1 }
    const resNest = engine.search("products", {
      q: "keyboard",
      projection: { title: 1, "meta.supplier.name": 1 },
    });
    expect(resNest.hits[0]!.source.fields).toEqual({ title: "Mechanical Keyboard" });
    expect(resNest.hits[0]!.source.meta).toEqual({
      supplier: { name: "Keychron" },
    });

    // 4. Document ID suppression: { title: 1, id: 0 }
    const resNoId = engine.search("products", {
      q: "keyboard",
      projection: { title: 1, id: 0 },
    });
    expect(resNoId.hits[0]!.id).toBe("proj-1"); // Hit envelope has id
    expect(resNoId.hits[0]!.source.id).toBeUndefined(); // Hit source suppressed id
    expect(resNoId.hits[0]!.source.fields).toEqual({ title: "Mechanical Keyboard" });

    // 5. Select alias: ["title", "price"]
    const resSelect = engine.search("products", {
      q: "keyboard",
      select: ["title", "price"],
    });
    expect(resSelect.hits[0]!.source.fields).toEqual({
      title: "Mechanical Keyboard",
      price: 129.99,
    });

    // 6. Elasticsearch _source: false alias
    const resNoSource = engine.search("products", {
      q: "keyboard",
      _source: false,
    });
    expect(resNoSource.hits[0]!.source.fields).toEqual({});
  });
});

describe("circuit breakers", () => {
  it("rejects oversized result windows", async () => {
    const { globalCircuits } = await import("../src/core/circuit.js");
    expect(() => globalCircuits.checkResultWindow(9990, 20)).toThrow(/Result window/);
    expect(() => globalCircuits.checkBulkSize(2000)).toThrow(/Bulk batch/);
  });
});
