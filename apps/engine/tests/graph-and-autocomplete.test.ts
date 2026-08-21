import { describe, it, expect, beforeEach } from "vitest";
import { AnveshEngine } from "../src/core/engine.js";
import { MemoryStorage } from "../src/storage/memory.js";
import { KnowledgeGraphStore } from "../src/core/knowledge-graph.js";

describe("Knowledge Graph Engine", () => {
  let graph: KnowledgeGraphStore;

  beforeEach(() => {
    graph = new KnowledgeGraphStore("products");
  });

  it("stores entities and resolves multi-hop relationships", () => {
    graph.addEntity({
      id: "product:kanjivaram_101",
      name: "Kanjivaram Silk Saree with Elephant Border",
      type: "Product",
      aliases: ["kanchipuram silk", "wedding saree"],
      docIds: ["doc-101"],
    });

    graph.addEntity({
      id: "motif:elephant",
      name: "Elephant Motif",
      type: "Motif",
      aliases: ["gaja motif", "elephant border"],
    });

    graph.addEntity({
      id: "fabric:pure_silk",
      name: "Pure Mulberry Silk",
      type: "Fabric",
      aliases: ["pure silk", "pattu"],
    });

    graph.addTriple({
      subject: "product:kanjivaram_101",
      predicate: "hasMotif",
      object: "motif:elephant",
    });

    graph.addTriple({
      subject: "product:kanjivaram_101",
      predicate: "hasFabric",
      object: "fabric:pure_silk",
    });

    // 1. Fetch 1-hop neighborhood of the product
    const neighborhood = graph.getNeighborhood("product:kanjivaram_101", 1);
    expect(neighborhood).not.toBeNull();
    expect(neighborhood!.nodes.length).toBe(2);
    expect(neighborhood!.nodes.some((n) => n.id === "motif:elephant")).toBe(true);
    expect(neighborhood!.nodes.some((n) => n.id === "fabric:pure_silk")).toBe(true);

    // 2. Search graph for "elephant" -> discovers related product and pure silk fabric
    const searchRes = graph.search("elephant", { maxHops: 1 });
    expect(searchRes.entities.some((e) => e.name === "Elephant Motif")).toBe(true);
    expect(searchRes.relatedDocIds).toContain("doc-101");
  });
});

describe("Multi-Facet Autocomplete Engine", () => {
  let engine: AnveshEngine;

  beforeEach(async () => {
    engine = new AnveshEngine(new MemoryStorage());
    await engine.init();
    await engine.createIndex("apparel", {
      name: { type: "text" },
      category: { type: "keyword" },
      tags: { type: "keyword" },
    });

    await engine.indexDocument("apparel", {
      id: "doc-1",
      fields: {
        name: "Royal Blue Kanjivaram Silk Saree",
        category: "Silk Sarees",
        tags: ["Gold Zari", "Elephant Motif", "Royal Blue"],
      },
    });

    await engine.indexDocument("apparel", {
      id: "doc-2",
      fields: {
        name: "Crimson Red Banarasi Saree",
        category: "Silk Sarees",
        tags: ["Silver Zari", "Floral Motif", "Crimson Red"],
      },
    });
  });

  it("returns multi-facet autocomplete suggestions", () => {
    // 1. Query autocomplete for "roy" -> returns document, visual tag, and query prefix
    const suggestions = engine.autocomplete("apparel", "roy", { size: 10 });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.text.toLowerCase().includes("royal"))).toBe(true);

    // 2. Query autocomplete for "silk" -> matches category and documents
    const silkSuggestions = engine.autocomplete("apparel", "silk", { size: 10 });
    expect(silkSuggestions.some((s) => s.text.toLowerCase().includes("silk"))).toBe(true);
  });
});
