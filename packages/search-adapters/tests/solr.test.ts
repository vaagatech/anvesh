import { describe, expect, it } from "vitest";
import {
  ERR_ADAPTER_UNSUPPORTED,
  mapAnveshQueryToSolr,
  mapSolrSearchResponse,
} from "../src/index.js";

describe("Solr mapper", () => {
  it("maps keyword query to edismax params", () => {
    const params = mapAnveshQueryToSolr({
      q: "lightweight search",
      fields: ["title", "body"],
      from: 5,
      size: 20,
    });
    expect(params).toMatchObject({
      q: "lightweight search",
      qf: "title body",
      defType: "edismax",
      start: 5,
      rows: 20,
      wt: "json",
    });
  });

  it("maps filters to fq", () => {
    const params = mapAnveshQueryToSolr({
      q: "docs",
      filters: [{ field: "role", value: "admin" }, { field: "score", gte: 1, lte: 5 }],
    });
    expect(params.fq).toBe('role:"admin" AND score:[1 TO 5]');
  });

  it("throws ERR_ADAPTER_UNSUPPORTED for vector search", () => {
    expect(() => mapAnveshQueryToSolr({ vector: [0.1], mode: "hybrid" })).toThrowError(
      expect.objectContaining({ code: ERR_ADAPTER_UNSUPPORTED }),
    );
  });

  it("throws ERR_ADAPTER_UNSUPPORTED for must/should/mustNot", () => {
    expect(() =>
      mapAnveshQueryToSolr({ q: "x", must: [{ field: "a", value: 1 }] }),
    ).toThrowError(expect.objectContaining({ code: ERR_ADAPTER_UNSUPPORTED }));
  });

  it("normalizes Solr response docs", () => {
    const result = mapSolrSearchResponse({
      response: {
        numFound: 1,
        docs: [{ id: "doc-1", title: "Hello", score: 2.1, _version_: 1 }],
      },
    });
    expect(result.total).toBe(1);
    expect(result.hits[0]?.id).toBe("doc-1");
    expect(result.hits[0]?.source.fields.title).toBe("Hello");
    expect(result.hits[0]?.source.fields._version_).toBeUndefined();
  });

  it("maps projection into Solr fl parameter", () => {
    const params = mapAnveshQueryToSolr({
      q: "test",
      projection: { title: 1, price: 1 },
    });
    expect(params.fl).toBe("id,title,price");
  });
});
