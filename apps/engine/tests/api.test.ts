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
});
