import { beforeAll, describe, expect, it } from "vitest";
import { getE2EContext, type E2EContext } from "./helpers/context.js";
import { engineRequest, HubClient, PORTS, workerRequest } from "./helpers/stack.js";

describe("e2e: health, auth, engine basics", () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await getE2EContext();
  }, 30_000);

  it("all services healthy; engine exposes circuits and ready/stats", async () => {
    const engine = await engineRequest(ctx.env, "GET", "/health");
    expect(engine.ok).toBe(true);
    expect(engine.json.circuits).toBeTruthy();
    expect(engine.headers.get("x-request-id") || engine.headers.get("x-anvesh-version")).toBeTruthy();

    const ready = await engineRequest(ctx.env, "GET", "/ready");
    expect(ready.ok).toBe(true);

    const stats = await engineRequest(ctx.env, "GET", "/v1/stats");
    expect(stats.ok).toBe(true);
    expect(stats.json.circuits || (stats.json.stats as object)).toBeTruthy();

    const hub = await ctx.admin.requestRaw("GET", "/hub/health");
    expect(hub.ok).toBe(true);

    expect((await fetch(`http://127.0.0.1:${PORTS.spider}/health`)).ok).toBe(true);
    expect((await fetch(`http://127.0.0.1:${PORTS.indexer}/health`)).ok).toBe(true);

    const fleet = await ctx.admin.request<{ online?: number; results?: unknown[] }>(
      "POST",
      "/hub/fleet/health",
    );
    expect((fleet.results as unknown[])?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("engine rejects missing API key and accepts x-api-key", async () => {
    const unauth = await engineRequest(ctx.env, "GET", "/v1/indexes", undefined, { apiKey: null });
    expect(unauth.status).toBe(401);

    const alt = await engineRequest(ctx.env, "GET", "/v1/indexes", undefined, {
      headerName: "x-api-key",
    });
    expect(alt.ok).toBe(true);
  });

  it("spider and indexer require API keys", async () => {
    const spider = await workerRequest(
      PORTS.spider,
      ctx.env.ANVESH_SPIDER_API_KEY,
      "POST",
      "/v1/jobs",
      { config: { seeds: [`${ctx.fixtureUrl}/`], maxPages: 1 } },
      false,
    );
    expect(spider.status).toBe(401);

    const indexer = await workerRequest(
      PORTS.indexer,
      ctx.env.ANVESH_INDEXER_API_KEY,
      "POST",
      "/v1/jobs",
      { index: "x" },
      false,
    );
    expect(indexer.status).toBe(401);
  });

  it("login failure, logout, wrong password, and audit trails", async () => {
    const anon = HubClient.forStack(ctx.env);
    const bad = await anon.requestRaw("POST", "/hub/auth/login", {
      username: "admin",
      password: "definitely-wrong-password",
    });
    expect(bad.status).toBe(401);

    const meNoAuth = await anon.requestRaw("GET", "/hub/auth/me");
    expect(meNoAuth.status).toBe(401);

    await anon.login(ctx.env.ANVESH_HUB_ADMIN_USER, ctx.env.ANVESH_HUB_ADMIN_PASSWORD);
    await anon.request("POST", "/hub/auth/logout");
    const afterLogout = await anon.requestRaw("GET", "/hub/auth/me");
    expect(afterLogout.status).toBe(401);

    // re-login admin for suite
    await ctx.admin.login(ctx.env.ANVESH_HUB_ADMIN_USER, ctx.env.ANVESH_HUB_ADMIN_PASSWORD);

    const wrongPw = await ctx.admin.requestRaw("POST", "/hub/auth/password", {
      currentPassword: "wrong-current",
      newPassword: "e2e-admin-password-xx",
    });
    expect(wrongPw.status).toBe(401);

    const audit = await ctx.admin.request<{
      entries: Array<{ action: string; ok: boolean }>;
      total: number;
    }>("GET", "/hub/audit?from=0&size=50");
    expect(audit.total).toBeGreaterThanOrEqual(1);
    expect(audit.entries.some((e) => e.action === "auth.login" && e.ok === false)).toBe(true);
  });

  it("password change invalidates sessions and enforces min length", async () => {
    const short = await ctx.admin.requestRaw("POST", "/hub/auth/password", {
      currentPassword: ctx.env.ANVESH_HUB_ADMIN_PASSWORD,
      newPassword: "short",
    });
    expect(short.status).toBe(400);

    await ctx.admin.request("POST", "/hub/auth/password", {
      currentPassword: ctx.env.ANVESH_HUB_ADMIN_PASSWORD,
      newPassword: "e2e-admin-password-2",
    });

    const stale = await ctx.admin.requestRaw("GET", "/hub/auth/me");
    expect(stale.status).toBe(401);

    const next = HubClient.forStack(ctx.env);
    await next.login(ctx.env.ANVESH_HUB_ADMIN_USER, "e2e-admin-password-2");
    await next.request("POST", "/hub/auth/password", {
      currentPassword: "e2e-admin-password-2",
      newPassword: ctx.env.ANVESH_HUB_ADMIN_PASSWORD,
    });
    await ctx.admin.login(ctx.env.ANVESH_HUB_ADMIN_USER, ctx.env.ANVESH_HUB_ADMIN_PASSWORD);
  });
});
