import { beforeAll, describe, expect, it } from "vitest";
import { getE2EContext, type E2EContext } from "./helpers/context.js";
import { HubClient } from "./helpers/stack.js";

describe("e2e: RBAC matrix (admin / operator / viewer)", () => {
  let ctx: E2EContext;
  let operator: HubClient;
  let viewer: HubClient;
  let operatorId: string;
  let viewerId: string;

  beforeAll(async () => {
    ctx = await getE2EContext();
    await ctx.admin.login(ctx.env.ANVESH_HUB_ADMIN_USER, ctx.env.ANVESH_HUB_ADMIN_PASSWORD);

    const op = await ctx.admin.request<{ user: { id: string } }>("POST", "/hub/users", {
      username: "e2e-operator",
      password: "e2e-operator-pass",
      role: "operator",
    });
    operatorId = op.user.id;

    const vw = await ctx.admin.request<{ user: { id: string } }>("POST", "/hub/users", {
      username: "e2e-viewer",
      password: "e2e-viewer-pass",
      role: "viewer",
    });
    viewerId = vw.user.id;

    const dup = await ctx.admin.requestRaw("POST", "/hub/users", {
      username: "e2e-operator",
      password: "e2e-operator-pass",
      role: "operator",
    });
    expect(dup.status).toBe(409);

    operator = HubClient.forStack(ctx.env);
    await operator.login("e2e-operator", "e2e-operator-pass");
    viewer = HubClient.forStack(ctx.env);
    await viewer.login("e2e-viewer", "e2e-viewer-pass");
  }, 60_000);

  it("viewer can read/search but not manage indexes, crawl, or users", async () => {
    const instances = await viewer.requestRaw("GET", "/hub/instances");
    expect(instances.ok).toBe(true);

    const indexes = await viewer.requestRaw("GET", `/hub/engines/${ctx.engineId}/indexes`);
    expect(indexes.ok).toBe(true);

    const createIdx = await viewer.requestRaw("POST", `/hub/engines/${ctx.engineId}/indexes`, {
      name: "viewer-blocked",
      mappings: { title: { type: "text" } },
    });
    expect(createIdx.status).toBe(403);

    const users = await viewer.requestRaw("GET", "/hub/users");
    expect(users.status).toBe(403);

    const spider = await viewer.requestRaw("GET", "/hub/spider-configs");
    expect(spider.status).toBe(403);

    const jobs = await viewer.requestRaw("GET", "/hub/jobs?from=0&size=5");
    expect(jobs.ok).toBe(true);

    const audit = await viewer.requestRaw("GET", "/hub/audit?from=0&size=5");
    expect(audit.ok).toBe(true);
  });

  it("operator can manage indexes/spider but not users or instances", async () => {
    const users = await operator.requestRaw("GET", "/hub/users");
    expect(users.status).toBe(403);

    const createInst = await operator.requestRaw("POST", "/hub/instances", {
      name: "op-blocked",
      kind: "engine",
      baseUrl: "http://127.0.0.1:19999",
    });
    expect(createInst.status).toBe(403);

    const createIdx = await operator.requestRaw("POST", `/hub/engines/${ctx.engineId}/indexes`, {
      name: "e2e-op-index",
      mappings: { title: { type: "text" }, body: { type: "text" } },
      settings: { vectorDimensions: 64, autoEmbed: true },
    });
    expect(createIdx.ok).toBe(true);

    const search = await operator.requestRaw(
      "POST",
      `/hub/engines/${ctx.engineId}/indexes/e2e-op-index/search`,
      { q: "nothing", mode: "keyword" },
    );
    // empty index may 400 empty query hits - still permission ok if not 403
    expect(search.status).not.toBe(403);

    await operator.request("DELETE", `/hub/engines/${ctx.engineId}/indexes/e2e-op-index`);
  });

  it("admin can list/delete users but not delete self", async () => {
    const users = await ctx.admin.request<{ users: Array<{ id: string; username: string }>; total: number }>(
      "GET",
      "/hub/users?from=0&size=50",
    );
    expect(users.total).toBeGreaterThanOrEqual(3);

    const self = users.users.find((u) => u.username === "admin");
    if (self) {
      const delSelf = await ctx.admin.requestRaw("DELETE", `/hub/users/${self.id}`);
      expect(delSelf.status).toBe(400);
    }

    // keep operator/viewer for other tests; cleanup soft — delete at end of this file
    await ctx.admin.request("DELETE", `/hub/users/${operatorId}`);
    await ctx.admin.request("DELETE", `/hub/users/${viewerId}`);
  });
});
