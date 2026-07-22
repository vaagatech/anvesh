import { describe, it, expect } from "vitest";
import { cosineSimilarity } from "../src/core/vector-store.js";
import { localEmbed, textFromFields, meaningfulVectorHits } from "../src/core/embed.js";

describe("localEmbed", () => {
  const dims = 256;

  it("ranks paraphrase of geo doc above unrelated bm25 doc", () => {
    const geo = localEmbed(
      textFromFields({
        title: "Geo search near Bengaluru",
        body: "Index geo_point fields and filter by radius. Sort by distance for location-aware demos.",
      }),
      dims,
    );
    const bm25 = localEmbed(
      textFromFields({
        title: "BM25 keyword search",
        body: "The engine ranks documents with BM25 for keyword queries.",
      }),
      dims,
    );
    const q = localEmbed("places near me on a map", dims);
    expect(cosineSimilarity(q, geo)).toBeGreaterThan(cosineSimilarity(q, bm25));
  });

  it("ranks semantic/hybrid doc for meaning query", () => {
    const sem = localEmbed(
      textFromFields({
        title: "Semantic and hybrid modes",
        body: "Combine keyword BM25 with vector similarity. Semantic mode helps when exact terms do not appear.",
      }),
      dims,
    );
    const geo = localEmbed(
      textFromFields({
        title: "Geo search near Bengaluru",
        body: "Filter by radius or bounding box.",
      }),
      dims,
    );
    const q = localEmbed("find similar meaning without exact words", dims);
    expect(cosineSimilarity(q, sem)).toBeGreaterThan(cosineSimilarity(q, geo));
  });

  it("identical text scores near 1", () => {
    const a = localEmbed("lightweight search stack", dims);
    const b = localEmbed("lightweight search stack", dims);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });

  it("meaningfulVectorHits drops weak noise", () => {
    const kept = meaningfulVectorHits([
      { id: "a", score: 0.8 },
      { id: "b", score: 0.5 },
      { id: "c", score: 0.05 },
    ]);
    expect(kept.map((x) => x.id)).toEqual(["a", "b"]);
  });
});
