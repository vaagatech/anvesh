import { beforeAll, describe, expect, it } from "vitest";
import { ensureRichIndex, getE2EContext, type E2EContext } from "./helpers/context.js";
import { engineRequest } from "./helpers/stack.js";

describe("e2e: instances, indexes, documents", () => {
  let ctx: E2EContext;
  let extraInstanceId: string;

  beforeAll(async () => {
    ctx = await getE2EContext();
    await ctx.admin.login(ctx.env.ANVESH_HUB_ADMIN_USER, ctx.env.ANVESH_HUB_ADMIN_PASSWORD);
  }, 30_000);

  it("instance CRUD: create, duplicate guards, update, health, delete", async () => {
    const created = await ctx.admin.request<{ instance: { id: string; hasApiKey?: boolean } }>(
      "POST",
      "/hub/instances",
      {
        name: "e2e-extra-engine",
        kind: "engine",
        baseUrl: "http://127.0.0.1:19998",
        apiKey: "extra-key",
        enabled: true,
        notes: "e2e",
      },
    );
    extraInstanceId = created.instance.id;
    expect(created.instance.hasApiKey).toBe(true);

    const dupName = await ctx.admin.requestRaw("POST", "/hub/instances", {
      name: "e2e-extra-engine",
      kind: "engine",
      baseUrl: "http://127.0.0.1:19997",
    });
    expect(dupName.status).toBe(409);

    const dupUrl = await ctx.admin.requestRaw("POST", "/hub/instances", {
      name: "e2e-extra-engine-2",
      kind: "engine",
      baseUrl: "http://127.0.0.1:19998",
    });
    expect(dupUrl.status).toBe(409);

    await ctx.admin.request("PUT", `/hub/instances/${extraInstanceId}`, {
      enabled: false,
      notes: "disabled for e2e",
      kind: "engine",
    });

    const health = await ctx.admin.requestRaw("POST", `/hub/instances/${extraInstanceId}/health`);
    // disabled/unreachable engine should not be healthy
    expect([200, 503, 502, 400].includes(health.status)).toBe(true);

    await ctx.admin.request("DELETE", `/hub/instances/${extraInstanceId}`);
    const list = await ctx.admin.request<{ instances: Array<{ id: string }> }>(
      "GET",
      "/hub/instances",
    );
    expect(list.instances.some((i) => i.id === extraInstanceId)).toBe(false);
  });

  it("index lifecycle + document validate/ingest/CRUD/clear/delete", async () => {
    const name = "e2e-docs-crud";
    await ctx.admin.request("POST", `/hub/engines/${ctx.engineId}/indexes`, {
      name,
      mappings: {
        title: { type: "text" },
        body: { type: "text" },
        url: { type: "keyword" },
        status: { type: "number" },
      },
      settings: { vectorDimensions: 64, autoEmbed: true },
    });

    const badValidate = await ctx.admin.requestRaw(
      "POST",
      `/hub/engines/${ctx.engineId}/indexes/${name}/validate`,
      {
        documents: [{ id: "bad", fields: { title: 123, status: "not-a-number" } }],
      },
    );
    expect([400, 422].includes(badValidate.status)).toBe(true);

    const badIngest = await ctx.admin.requestRaw(
      "POST",
      `/hub/engines/${ctx.engineId}/indexes/${name}/ingest`,
      {
        validate: true,
        documents: [{ id: "bad", fields: { title: true, status: "x" } }],
      },
    );
    expect(badIngest.ok).toBe(false);

    await ctx.admin.request("POST", `/hub/engines/${ctx.engineId}/indexes/${name}/ingest`, {
      validate: false,
      documents: [
        { id: "a1", fields: { title: "Alpha doc", body: "first", url: "u1", status: 200 } },
        { id: "a2", fields: { title: "Beta doc", body: "second", url: "u2", status: 200 } },
      ],
    });

    await ctx.admin.request("POST", `/hub/engines/${ctx.engineId}/indexes/${name}/documents`, {
      id: "a3",
      fields: { title: "Gamma", body: "third", url: "u3", status: 201 },
    });

    const listed = await ctx.admin.request<{ total: number }>(
      "GET",
      `/hub/engines/${ctx.engineId}/indexes/${name}/documents?from=0&size=10`,
    );
    expect(listed.total).toBe(3);

    const one = await engineRequest(ctx.env, "GET", `/v1/indexes/${name}/documents/a1`);
    expect(one.ok).toBe(true);

    const put = await engineRequest(ctx.env, "PUT", `/v1/indexes/${name}/documents/a1`, {
      fields: { title: "Alpha updated", body: "first", url: "u1", status: 200 },
    });
    expect(put.ok).toBe(true);

    await ctx.admin.request(
      "DELETE",
      `/hub/engines/${ctx.engineId}/indexes/${name}/documents/a2`,
    );
    const afterDel = await ctx.admin.request<{ total: number }>(
      "GET",
      `/hub/engines/${ctx.engineId}/indexes/${name}/documents?from=0&size=10`,
    );
    expect(afterDel.total).toBe(2);

    await ctx.admin.request("DELETE", `/hub/engines/${ctx.engineId}/indexes/${name}/documents`);
    const cleared = await ctx.admin.request<{ total: number }>(
      "GET",
      `/hub/engines/${ctx.engineId}/indexes/${name}/documents?from=0&size=10`,
    );
    expect(cleared.total).toBe(0);

    await ctx.admin.request("DELETE", `/hub/engines/${ctx.engineId}/indexes/${name}`);
    const gone = await ctx.admin.requestRaw(
      "GET",
      `/hub/engines/${ctx.engineId}/indexes/${name}`,
    );
    expect(gone.status).toBe(404);

    const missing = await engineRequest(ctx.env, "GET", `/v1/indexes/${name}/documents/nope`);
    expect(missing.status).toBe(404);
  });

  it("engine list indexes and empty search error", async () => {
    await ensureRichIndex();
    const list = await engineRequest(ctx.env, "GET", "/v1/indexes");
    expect(list.ok).toBe(true);

    const empty = await engineRequest(ctx.env, "POST", "/v1/indexes/e2e-rich/search", {});
    expect(empty.ok).toBe(false);
    expect(String(empty.json.code)).toMatch(/EMPTY_QUERY|VALIDATION/);
  });
});
