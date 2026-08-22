import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAnveshApp } from "../src/api/server.js";
import type { FastifyInstance } from "fastify";

describe("API", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const created = await createAnveshApp({
      storage: "memory",
      apiKey: "test-key",
      loggerPretty: false,
    });
    app = created.app;
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects missing api key", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/indexes" });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.message).toMatch(/Authentication failed/i);
  });

  it("creates index, documents, and searches with meaningful messages", async () => {
    const headers = { authorization: "Bearer test-key" };

    const created = await app.inject({
      method: "POST",
      url: "/v1/indexes",
      headers,
      payload: {
        name: "docs",
        mappings: {
          title: { type: "text" },
          body: { type: "text" },
        },
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().message).toMatch(/ready/i);

    await app.inject({
      method: "POST",
      url: "/v1/indexes/docs/documents",
      headers,
      payload: {
        id: "1",
        fields: { title: "Hello Anvesh", body: "Lightweight search by VaagaTech" },
      },
    });

    const search = await app.inject({
      method: "POST",
      url: "/v1/indexes/docs/search",
      headers,
      payload: { q: "lightweight search" },
    });
    expect(search.statusCode).toBe(200);
    const body = search.json();
    expect(body.ok).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.message).toMatch(/Search completed/i);
  });

  it("auto-creates target index during bulk indexing", async () => {
    const headers = { authorization: "Bearer test-key" };
    const res = await app.inject({
      method: "POST",
      url: "/v1/indexes/auto_created_idx/documents/_bulk",
      headers,
      payload: {
        documents: [
          { id: "b1", fields: { title: "Auto Created Index", category: "test" } },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.result.indexed).toBe(1);

    const getIdx = await app.inject({
      method: "GET",
      url: "/v1/indexes/auto_created_idx",
      headers,
    });
    expect(getIdx.statusCode).toBe(200);
    expect(getIdx.json().index.docCount).toBe(1);
  });


  it("health is public", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().product).toBe("Anvesh");
  });

  it("lists and invokes plugins like LLM tools", async () => {
    const headers = { authorization: "Bearer test-key" };
    const tools = await app.inject({ method: "GET", url: "/v1/plugins/tools", headers });
    expect(tools.statusCode).toBe(200);
    const catalog = tools.json().tools as Array<{ name: string }>;
    expect(catalog.map((t) => t.name)).toEqual(
      expect.arrayContaining(["vaakly.correct_summary", "vaakly.format_message"]),
    );

    const invoked = await app.inject({
      method: "POST",
      url: "/v1/plugins/invoke",
      headers,
      payload: {
        name: "vaakly.correct_summary",
        arguments: {
          message: "Found 2 matching document(s).",
          code: "OK_SEARCH",
          total: 2,
        },
      },
    });
    expect(invoked.statusCode).toBe(200);
    expect(invoked.json().result.message).toContain("2 matching documents");
  });

  it("supports projection selection via POST and GET search and document APIs", async () => {
    const headers = { authorization: "Bearer test-key" };

    // POST /search with MongoDB-style projection
    const postSearch = await app.inject({
      method: "POST",
      url: "/v1/indexes/docs/search",
      headers,
      payload: {
        q: "Hello",
        projection: { title: 1 },
      },
    });
    expect(postSearch.statusCode).toBe(200);
    const postBody = postSearch.json();
    expect(postBody.hits[0].source.fields).toEqual({ title: "Hello Anvesh" });
    expect(postBody.hits[0].source.fields.body).toBeUndefined();

    // GET /search with ?select=title
    const getSearch = await app.inject({
      method: "GET",
      url: "/v1/indexes/docs/search?q=Hello&select=title",
      headers,
    });
    expect(getSearch.statusCode).toBe(200);
    const getBody = getSearch.json();
    expect(getBody.hits[0].source.fields).toEqual({ title: "Hello Anvesh" });

    // GET /documents/:id with ?projection={"title":1}
    const getDoc = await app.inject({
      method: "GET",
      url: "/v1/indexes/docs/documents/1?select=title",
      headers,
    });
    expect(getDoc.statusCode).toBe(200);
    expect(getDoc.json().document.fields).toEqual({ title: "Hello Anvesh" });
  });
});
