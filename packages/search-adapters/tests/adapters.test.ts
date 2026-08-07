import { describe, expect, it, vi } from "vitest";
import { createSearchBackend, ERR_ADAPTER_UNSUPPORTED } from "../src/index.js";

describe("createSearchBackend", () => {
  it("proxies Anvesh search over /v1", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith("/health")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (u.includes("/search")) {
        return new Response(
          JSON.stringify({
            ok: true,
            total: 1,
            tookMs: 3,
            hits: [{ id: "1", score: 1, source: { id: "1", fields: { title: "Hi" } } }],
            message: "Search completed.",
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    });

    const backend = createSearchBackend({
      kind: "anvesh",
      baseUrl: "http://127.0.0.1:3848",
      fetchImpl,
    });

    expect(await backend.health()).toBe(true);
    const result = await backend.search("docs", { q: "hi" });
    expect(result.total).toBe(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:3848/v1/indexes/docs/search",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("maps Elasticsearch search to _search", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/_search")) {
        const body = JSON.parse(String(init?.body));
        expect(body.query.bool.must[0].bool.must[0].multi_match.query).toBe("hello");
        return new Response(
          JSON.stringify({
            took: 4,
            hits: { total: { value: 0 }, hits: [] },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    });

    const backend = createSearchBackend({
      kind: "elasticsearch",
      baseUrl: "http://es.local:9200",
      fetchImpl,
    });

    await backend.search("articles", { q: "hello", fields: ["title"] });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://es.local:9200/articles/_search",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces ERR_ADAPTER_UNSUPPORTED from adapter search", async () => {
    const backend = createSearchBackend({
      kind: "solr",
      baseUrl: "http://solr.local:8983/solr",
      fetchImpl: vi.fn(),
    });

    await expect(backend.search("core", { vector: [0.1], mode: "semantic" })).rejects.toMatchObject({
      code: ERR_ADAPTER_UNSUPPORTED,
    });
  });
});
