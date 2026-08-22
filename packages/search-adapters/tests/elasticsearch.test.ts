import { describe, expect, it } from "vitest";
import {
  ERR_ADAPTER_UNSUPPORTED,
  mapAnveshQueryToElasticsearch,
  mapElasticsearchSearchResponse,
} from "../src/index.js";

describe("Elasticsearch mapper", () => {
  it("maps keyword query to multi_match", () => {
    const body = mapAnveshQueryToElasticsearch({
      q: "lightweight search",
      fields: ["title", "body"],
      from: 0,
      size: 10,
      fuzziness: "AUTO",
    });
    expect(body).toMatchObject({
      from: 0,
      size: 10,
      query: {
        bool: {
          must: [
            {
              bool: {
                must: [
                  {
                    multi_match: {
                      query: "lightweight search",
                      fields: ["title", "body"],
                      type: "best_fields",
                      fuzziness: "AUTO",
                    },
                  },
                ],
                should: [
                  {
                    multi_match: {
                      query: "lightweight search",
                      fields: ["title", "body"],
                      type: "phrase",
                      boost: 10,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });
  });

  it("maps filters and bool clauses", () => {
    const body = mapAnveshQueryToElasticsearch({
      q: "docs",
      must: [{ field: "status", value: 200 }],
      mustNot: [{ field: "archived", value: true }],
      filters: [{ field: "role", value: "admin" }, { field: "score", gte: 1, lte: 10 }],
    });
    const bool = (body.query as { bool: Record<string, unknown> }).bool;
    expect(bool.must).toHaveLength(2);
    expect(bool.must_not).toEqual([{ term: { archived: true } }]);
    expect(bool.filter).toEqual([
      { term: { role: "admin" } },
      { range: { score: { gte: 1, lte: 10 } } },
    ]);
  });

  it("throws ERR_ADAPTER_UNSUPPORTED for vector search", () => {
    expect(() =>
      mapAnveshQueryToElasticsearch({ vector: [0.1, 0.2], mode: "semantic" }),
    ).toThrowError(expect.objectContaining({ code: ERR_ADAPTER_UNSUPPORTED }));
  });

  it("throws ERR_ADAPTER_UNSUPPORTED for geo mode", () => {
    expect(() => mapAnveshQueryToElasticsearch({ mode: "geo", q: "nearby" })).toThrowError(
      expect.objectContaining({ code: ERR_ADAPTER_UNSUPPORTED }),
    );
  });

  it("normalizes Elasticsearch hits", () => {
    const result = mapElasticsearchSearchResponse({
      took: 12,
      hits: {
        total: { value: 2 },
        hits: [
          { _id: "1", _score: 1.5, _source: { title: "Hello" } },
          { _id: "2", _score: 0.8, _source: { title: "World" } },
        ],
      },
    });
    expect(result.total).toBe(2);
    expect(result.hits[0]?.id).toBe("1");
    expect(result.hits[0]?.source.fields.title).toBe("Hello");
  });

  it("maps MongoDB-style projections and _source filters into Elasticsearch _source", () => {
    // Inclusion projection object
    const body1 = mapAnveshQueryToElasticsearch({
      q: "test",
      projection: { title: 1, price: 1 },
    });
    expect(body1._source).toEqual(["title", "price"]);

    // Exclusion projection object
    const body2 = mapAnveshQueryToElasticsearch({
      q: "test",
      projection: { body: 0, internalSecret: 0 },
    });
    expect(body2._source).toEqual({ excludes: ["body", "internalSecret"] });

    // Explicit _source: false
    const body3 = mapAnveshQueryToElasticsearch({
      q: "test",
      _source: false,
    });
    expect(body3._source).toBe(false);
  });
});
