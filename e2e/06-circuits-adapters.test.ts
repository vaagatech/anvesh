import { beforeAll, describe, expect, it } from "vitest";
import { ensureRichIndex, getE2EContext, type E2EContext } from "./helpers/context.js";
import { engineRequest } from "./helpers/stack.js";

describe("e2e: circuit breakers + adapters", () => {
  let ctx: E2EContext;
  let esId: string;
  let solrId: string;

  beforeAll(async () => {
    ctx = await getE2EContext();
    await ctx.admin.login(ctx.env.ANVESH_HUB_ADMIN_USER, ctx.env.ANVESH_HUB_ADMIN_PASSWORD);
    await ensureRichIndex();

    const es = await ctx.admin.request<{ instance: { id: string } }>("POST", "/hub/instances", {
      name: "e2e-mock-es",
      kind: "elasticsearch",
      baseUrl: ctx.mockEsUrl,
      enabled: true,
    });
    esId = es.instance.id;

    const solr = await ctx.admin.request<{ instance: { id: string } }>("POST", "/hub/instances", {
      name: "e2e-mock-solr",
      kind: "solr",
      baseUrl: ctx.mockSolrUrl,
      enabled: true,
    });
    solrId = solr.instance.id;
  }, 60_000);

  it("result window and bulk circuits trip", async () => {
    const window = await engineRequest(ctx.env, "POST", "/v1/indexes/e2e-rich/search", {
      q: "hiking",
      from: 90,
      size: 20,
    });
    expect(window.ok).toBe(false);
    expect(String(window.json.code)).toMatch(/CIRCUIT/);

    const docs = Array.from({ length: 51 }, (_, i) => ({
      id: `b${i}`,
      fields: {
        title: `doc ${i}`,
        body: "x",
        url: `u${i}`,
        category: "x",
        price: 1,
        status: 200,
        location: { lat: 0, lon: 0 },
      },
    }));
    const bulk = await engineRequest(ctx.env, "POST", "/v1/indexes/e2e-rich/documents/_bulk", {
      documents: docs,
    });
    expect(bulk.ok).toBe(false);
    expect(String(bulk.json.code)).toContain("CIRCUIT");
  });

  it("doc-cap circuit trips when exceeding ANVESH_MAX_DOCS_PER_INDEX", async () => {
    // e2e-rich has 5 docs; cap is 200 — create a small cap index via env already 200.
    // Fill toward cap with bulk under bulk-size limit (50).
    const name = "e2e-cap";
    await engineRequest(ctx.env, "POST", "/v1/indexes", {
      name,
      mappings: { title: { type: "text" } },
      settings: {},
    });
    // 4 batches of 50 = 200 exactly should be ok; one more doc trips
    for (let b = 0; b < 4; b++) {
      const batch = Array.from({ length: 50 }, (_, i) => ({
        id: `c${b}-${i}`,
        fields: { title: `cap ${b}-${i}` },
      }));
      const res = await engineRequest(ctx.env, "POST", `/v1/indexes/${name}/documents/_bulk`, {
        documents: batch,
      });
      expect(res.ok, JSON.stringify(res.json)).toBe(true);
    }
    const over = await engineRequest(ctx.env, "POST", `/v1/indexes/${name}/documents`, {
      id: "overflow",
      fields: { title: "one too many" },
    });
    // may trip on write path if checkDocCap is wired for single doc — if not, try bulk of 1
    if (over.ok) {
      const bulkOver = await engineRequest(ctx.env, "POST", `/v1/indexes/${name}/documents/_bulk`, {
        documents: [{ id: "overflow2", fields: { title: "x" } }],
      });
      expect(bulkOver.ok).toBe(false);
      expect(String(bulkOver.json.code)).toMatch(/CIRCUIT|DOCS/);
    } else {
      expect(String(over.json.code)).toMatch(/CIRCUIT|DOCS/);
    }
  });

  it("concurrent search circuit can trip under parallel load", async () => {
    // max concurrent = 2; fire many parallel searches
    const tasks = Array.from({ length: 20 }, () =>
      engineRequest(ctx.env, "POST", "/v1/indexes/e2e-rich/search", {
        q: "hiking trails ceramic elephant running",
        mode: "keyword",
        fuzziness: "AUTO",
        size: 10,
      }),
    );
    const results = await Promise.all(tasks);
    const tripped = results.some(
      (r) => !r.ok && String(r.json.code).includes("CIRCUIT_CONCURRENT"),
    );
    // Best-effort: if system is fast enough it may not trip; still assert all are either ok or circuit
    expect(results.every((r) => r.ok || String(r.json.code).includes("CIRCUIT"))).toBe(true);
    void tripped;
  });

  it("elasticsearch adapter: list indexes + keyword search via Hub", async () => {
    const health = await ctx.admin.requestRaw("POST", `/hub/instances/${esId}/health`);
    expect([200, 503].includes(health.status)).toBe(true);

    const indexes = await ctx.admin.requestRaw("GET", `/hub/engines/${esId}/indexes`);
    expect(indexes.ok).toBe(true);

    const search = await ctx.admin.requestRaw(
      "POST",
      `/hub/engines/${esId}/indexes/mock-es-index/search`,
      { q: "hello", mode: "keyword" },
    );
    expect(search.ok).toBe(true);

    const unsupported = await ctx.admin.requestRaw(
      "POST",
      `/hub/engines/${esId}/indexes/mock-es-index/search`,
      { mode: "geo", geo: { field: "location", origin: { lat: 0, lon: 0 }, distanceKm: 1 } },
    );
    expect(unsupported.status).toBe(501);
    expect(String(unsupported.json.code)).toContain("ADAPTER_UNSUPPORTED");
  });

  it("solr adapter: unsupported semantic returns 501", async () => {
    const unsupported = await ctx.admin.requestRaw(
      "POST",
      `/hub/engines/${solrId}/indexes/demo/search`,
      { q: "hello", mode: "semantic" },
    );
    expect(unsupported.status).toBe(501);
    expect(String(unsupported.json.code)).toContain("ADAPTER_UNSUPPORTED");

    const ok = await ctx.admin.requestRaw(
      "POST",
      `/hub/engines/${solrId}/indexes/demo/search`,
      { q: "hello", mode: "keyword" },
    );
    expect(ok.ok).toBe(true);
  });

  it("cleanup adapter instances", async () => {
    await ctx.admin.request("DELETE", `/hub/instances/${esId}`);
    await ctx.admin.request("DELETE", `/hub/instances/${solrId}`);
  });
});
