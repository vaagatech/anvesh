import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { HubStore } from "./store.js";
import { can, type HubRole, type InstanceKind, type Permission } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function publicUser(u: { id: string; username: string; role: HubRole; createdAt: string }) {
  return { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt };
}

async function proxyEngine(
  baseUrl: string,
  apiKey: string | undefined,
  method: string,
  urlPath: string,
  body?: unknown,
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { message: text };
  }
  return { status: res.status, json };
}

export async function createHubServer(options?: {
  dataDir?: string;
  uiDist?: string;
  port?: number;
  host?: string;
}) {
  const dataDir = options?.dataDir ?? process.env.ANVESH_HUB_DATA ?? ".anvesh/hub";
  const store = new HubStore(dataDir);
  await store.getState();

  // Bootstrap admin if empty
  const state = await store.getState();
  if (state.users.length === 0) {
    const username = process.env.ANVESH_HUB_ADMIN_USER ?? "admin";
    const password = process.env.ANVESH_HUB_ADMIN_PASSWORD ?? "anvesh-admin-change-me";
    const { hash, salt } = HubStore.hashPassword(password);
    await store.update((s) => {
      s.users.push({
        id: randomUUID(),
        username,
        passwordHash: hash,
        salt,
        role: "admin",
        createdAt: new Date().toISOString(),
      });
    });
    // eslint-disable-next-line no-console
    console.log(
      `Hub bootstrap: created admin user "${username}". Change ANVESH_HUB_ADMIN_PASSWORD before production.`,
    );
  }

  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(cors, { origin: true });

  async function auth(
    req: { headers: Record<string, string | string[] | undefined> },
    permission?: Permission,
  ) {
    const header = String(req.headers.authorization ?? "");
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      const err = new Error("Authentication required. Sign in to continue.");
      (err as Error & { statusCode: number }).statusCode = 401;
      throw err;
    }
    const s = await store.getState();
    const session = s.sessions.find((x) => x.token === token && x.expiresAt > new Date().toISOString());
    if (!session) {
      const err = new Error("Session expired or invalid. Please sign in again.");
      (err as Error & { statusCode: number }).statusCode = 401;
      throw err;
    }
    const user = s.users.find((u) => u.id === session.userId);
    if (!user) {
      const err = new Error("User no longer exists.");
      (err as Error & { statusCode: number }).statusCode = 401;
      throw err;
    }
    if (permission && !can(user.role, permission)) {
      const err = new Error("You do not have permission for this action.");
      (err as Error & { statusCode: number }).statusCode = 403;
      throw err;
    }
    return user;
  }

  app.setErrorHandler((err, _req, reply) => {
    const status = (err as Error & { statusCode?: number }).statusCode ?? 500;
    reply.status(status).send({
      ok: false,
      message: err.message || "Something went wrong on the Hub.",
    });
  });

  app.get("/hub/health", async () => {
    const s = await store.getState();
    return {
      ok: true,
      product: "Anvesh Hub",
      vendor: "VaagaTech",
      users: s.users.length,
      instances: s.instances.length,
      message: "Anvesh Hub is healthy and ready to manage your search stack.",
    };
  });

  app.post("/hub/auth/login", async (req, reply) => {
    const body = z
      .object({ username: z.string().min(1), password: z.string().min(1) })
      .parse(req.body);
    const s = await store.getState();
    const user = s.users.find((u) => u.username === body.username);
    if (!user || !HubStore.verifyPassword(user, body.password)) {
      return reply.status(401).send({
        ok: false,
        message: "Username or password is incorrect.",
      });
    }
    const token = HubStore.newToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
    await store.update((st) => {
      st.sessions = st.sessions.filter((x) => x.expiresAt > new Date().toISOString());
      st.sessions.push({
        token,
        userId: user.id,
        createdAt: new Date().toISOString(),
        expiresAt,
      });
    });
    return {
      ok: true,
      message: `Welcome back, ${user.username}.`,
      token,
      expiresAt,
      user: publicUser(user),
    };
  });

  app.post("/hub/auth/logout", async (req) => {
    const header = String(req.headers.authorization ?? "");
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    await store.update((s) => {
      s.sessions = s.sessions.filter((x) => x.token !== token);
    });
    return { ok: true, message: "Signed out successfully." };
  });

  app.get("/hub/auth/me", async (req) => {
    const user = await auth(req);
    return { ok: true, user: publicUser(user) };
  });

  // Users (RBAC admin)
  app.get("/hub/users", async (req) => {
    await auth(req, "users:manage");
    const s = await store.getState();
    return { ok: true, users: s.users.map(publicUser) };
  });

  app.post("/hub/users", async (req, reply) => {
    await auth(req, "users:manage");
    const body = z
      .object({
        username: z.string().min(2).max(64),
        password: z.string().min(8),
        role: z.enum(["admin", "operator", "viewer"]),
      })
      .parse(req.body);
    const s = await store.getState();
    if (s.users.some((u) => u.username === body.username)) {
      return reply.status(409).send({ ok: false, message: "That username is already taken." });
    }
    const { hash, salt } = HubStore.hashPassword(body.password);
    const user = {
      id: randomUUID(),
      username: body.username,
      passwordHash: hash,
      salt,
      role: body.role as HubRole,
      createdAt: new Date().toISOString(),
    };
    await store.update((st) => {
      st.users.push(user);
    });
    return reply.status(201).send({
      ok: true,
      message: `User "${body.username}" created with role ${body.role}.`,
      user: publicUser(user),
    });
  });

  app.delete("/hub/users/:id", async (req, reply) => {
    const me = await auth(req, "users:manage");
    const { id } = req.params as { id: string };
    if (me.id === id) {
      return reply.status(400).send({ ok: false, message: "You cannot delete your own account." });
    }
    await store.update((s) => {
      s.users = s.users.filter((u) => u.id !== id);
      s.sessions = s.sessions.filter((x) => x.userId !== id);
    });
    return { ok: true, message: "User removed." };
  });

  // Instances — multiple engines / indexers / spiders
  app.get("/hub/instances", async (req) => {
    await auth(req, "instances:read");
    const s = await store.getState();
    return {
      ok: true,
      instances: s.instances.map(({ apiKey: _k, ...rest }) => ({
        ...rest,
        hasApiKey: Boolean(_k),
      })),
      message: `Tracking ${s.instances.length} application instance(s).`,
    };
  });

  app.post("/hub/instances", async (req, reply) => {
    await auth(req, "instances:manage");
    const body = z
      .object({
        name: z.string().min(1),
        kind: z.enum(["engine", "indexer", "spider"]),
        baseUrl: z.string().url(),
        apiKey: z.string().optional(),
        notes: z.string().optional(),
        enabled: z.boolean().default(true),
      })
      .parse(req.body);
    const instance = {
      id: randomUUID(),
      name: body.name,
      kind: body.kind as InstanceKind,
      baseUrl: body.baseUrl.replace(/\/$/, ""),
      apiKey: body.apiKey,
      enabled: body.enabled,
      notes: body.notes,
      createdAt: new Date().toISOString(),
    };
    await store.update((s) => {
      s.instances.push(instance);
    });
    return reply.status(201).send({
      ok: true,
      message: `${body.kind} instance "${body.name}" registered.`,
      instance: { ...instance, apiKey: undefined, hasApiKey: Boolean(instance.apiKey) },
    });
  });

  app.delete("/hub/instances/:id", async (req) => {
    await auth(req, "instances:manage");
    const { id } = req.params as { id: string };
    await store.update((s) => {
      s.instances = s.instances.filter((i) => i.id !== id);
    });
    return { ok: true, message: "Instance removed from Hub." };
  });

  app.post("/hub/instances/:id/health", async (req) => {
    await auth(req, "instances:read");
    const { id } = req.params as { id: string };
    const s = await store.getState();
    const inst = s.instances.find((i) => i.id === id);
    if (!inst) {
      const err = new Error("Instance not found.");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    const pathHealth = inst.kind === "engine" ? "/health" : "/health";
    try {
      const res = await fetch(`${inst.baseUrl}${pathHealth}`, {
        headers: inst.apiKey ? { authorization: `Bearer ${inst.apiKey}` } : {},
      });
      const json = await res.json().catch(() => ({}));
      return {
        ok: res.ok,
        status: res.status,
        body: json,
        message: res.ok
          ? `Instance "${inst.name}" is reachable.`
          : `Instance "${inst.name}" returned HTTP ${res.status}.`,
      };
    } catch (err) {
      return {
        ok: false,
        message: `Could not reach "${inst.name}": ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });

  // Engine indexes via selected instance
  app.get("/hub/engines/:instanceId/indexes", async (req) => {
    await auth(req, "indexes:read");
    const { instanceId } = req.params as { instanceId: string };
    const s = await store.getState();
    const inst = s.instances.find((i) => i.id === instanceId && i.kind === "engine");
    if (!inst) {
      const err = new Error("Engine instance not found.");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    const proxied = await proxyEngine(inst.baseUrl, inst.apiKey, "GET", "/v1/indexes");
    return proxied.json;
  });

  app.post("/hub/engines/:instanceId/indexes", async (req, reply) => {
    await auth(req, "indexes:manage");
    const { instanceId } = req.params as { instanceId: string };
    const s = await store.getState();
    const inst = s.instances.find((i) => i.id === instanceId && i.kind === "engine");
    if (!inst) {
      return reply.status(404).send({ ok: false, message: "Engine instance not found." });
    }
    const proxied = await proxyEngine(inst.baseUrl, inst.apiKey, "POST", "/v1/indexes", req.body);
    return reply.status(proxied.status).send(proxied.json);
  });

  app.delete("/hub/engines/:instanceId/indexes/:name", async (req, reply) => {
    await auth(req, "indexes:manage");
    const { instanceId, name } = req.params as { instanceId: string; name: string };
    const s = await store.getState();
    const inst = s.instances.find((i) => i.id === instanceId && i.kind === "engine");
    if (!inst) {
      return reply.status(404).send({ ok: false, message: "Engine instance not found." });
    }
    const proxied = await proxyEngine(
      inst.baseUrl,
      inst.apiKey,
      "DELETE",
      `/v1/indexes/${encodeURIComponent(name)}`,
    );
    return reply.status(proxied.status).send(proxied.json);
  });

  app.post("/hub/engines/:instanceId/indexes/:name/search", async (req, reply) => {
    await auth(req, "search:run");
    const { instanceId, name } = req.params as { instanceId: string; name: string };
    const s = await store.getState();
    const inst = s.instances.find((i) => i.id === instanceId && i.kind === "engine");
    if (!inst) {
      return reply.status(404).send({ ok: false, message: "Engine instance not found." });
    }
    const proxied = await proxyEngine(
      inst.baseUrl,
      inst.apiKey,
      "POST",
      `/v1/indexes/${encodeURIComponent(name)}/search`,
      req.body,
    );
    return reply.status(proxied.status).send(proxied.json);
  });

  app.post("/hub/engines/:instanceId/indexes/:name/documents", async (req, reply) => {
    await auth(req, "indexes:manage");
    const { instanceId, name } = req.params as { instanceId: string; name: string };
    const s = await store.getState();
    const inst = s.instances.find((i) => i.id === instanceId && i.kind === "engine");
    if (!inst) {
      return reply.status(404).send({ ok: false, message: "Engine instance not found." });
    }
    const proxied = await proxyEngine(
      inst.baseUrl,
      inst.apiKey,
      "POST",
      `/v1/indexes/${encodeURIComponent(name)}/documents`,
      req.body,
    );
    return reply.status(proxied.status).send(proxied.json);
  });

  // Spider configs
  app.get("/hub/spider-configs", async (req) => {
    await auth(req, "spider:manage");
    const s = await store.getState();
    return { ok: true, configs: s.spiderConfigs };
  });

  app.post("/hub/spider-configs", async (req, reply) => {
    await auth(req, "spider:manage");
    const body = z
      .object({
        name: z.string().min(1),
        description: z.string().optional(),
        instanceId: z.string().optional(),
        config: z.record(z.unknown()),
      })
      .parse(req.body);
    const row = {
      id: randomUUID(),
      name: body.name,
      description: body.description,
      instanceId: body.instanceId,
      config: body.config,
      updatedAt: new Date().toISOString(),
    };
    await store.update((s) => {
      s.spiderConfigs.push(row);
    });
    return reply.status(201).send({
      ok: true,
      message: `Spider configuration "${body.name}" saved.`,
      config: row,
    });
  });

  app.put("/hub/spider-configs/:id", async (req) => {
    await auth(req, "spider:manage");
    const { id } = req.params as { id: string };
    const body = z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        instanceId: z.string().optional(),
        config: z.record(z.unknown()).optional(),
      })
      .parse(req.body);
    let updated = null as unknown;
    await store.update((s) => {
      const row = s.spiderConfigs.find((c) => c.id === id);
      if (!row) return;
      if (body.name) row.name = body.name;
      if (body.description !== undefined) row.description = body.description;
      if (body.instanceId !== undefined) row.instanceId = body.instanceId;
      if (body.config) row.config = body.config;
      row.updatedAt = new Date().toISOString();
      updated = row;
    });
    if (!updated) {
      const err = new Error("Spider configuration not found.");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    return { ok: true, message: "Spider configuration updated.", config: updated };
  });

  app.delete("/hub/spider-configs/:id", async (req) => {
    await auth(req, "spider:manage");
    const { id } = req.params as { id: string };
    await store.update((s) => {
      s.spiderConfigs = s.spiderConfigs.filter((c) => c.id !== id);
    });
    return { ok: true, message: "Spider configuration deleted." };
  });

  app.post("/hub/spider-configs/:id/run", async (req, reply) => {
    await auth(req, "spider:run");
    const { id } = req.params as { id: string };
    const s = await store.getState();
    const cfg = s.spiderConfigs.find((c) => c.id === id);
    if (!cfg) {
      return reply.status(404).send({ ok: false, message: "Spider configuration not found." });
    }
    const inst = s.instances.find(
      (i) => i.id === (cfg.instanceId ?? "") && i.kind === "spider" && i.enabled,
    );
    if (!inst) {
      return reply.status(400).send({
        ok: false,
        message: "Assign an enabled spider instance to this configuration before running.",
      });
    }
    const res = await fetch(`${inst.baseUrl}/v1/jobs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(inst.apiKey ? { authorization: `Bearer ${inst.apiKey}` } : {}),
      },
      body: JSON.stringify({ config: cfg.config }),
    });
    const json = await res.json().catch(() => ({}));
    return reply.status(res.status).send(json);
  });

  // Indexer configs
  app.get("/hub/indexer-configs", async (req) => {
    await auth(req, "indexer:manage");
    const s = await store.getState();
    return { ok: true, configs: s.indexerConfigs };
  });

  app.post("/hub/indexer-configs", async (req, reply) => {
    await auth(req, "indexer:manage");
    const body = z
      .object({
        name: z.string().min(1),
        description: z.string().optional(),
        instanceId: z.string().optional(),
        engineInstanceId: z.string().optional(),
        indexName: z.string().min(1),
        inputPath: z.string().optional(),
        batchSize: z.number().int().positive().optional(),
      })
      .parse(req.body);
    const row = {
      id: randomUUID(),
      ...body,
      updatedAt: new Date().toISOString(),
    };
    await store.update((s) => {
      s.indexerConfigs.push(row);
    });
    return reply.status(201).send({
      ok: true,
      message: `Indexer configuration "${body.name}" saved.`,
      config: row,
    });
  });

  app.delete("/hub/indexer-configs/:id", async (req) => {
    await auth(req, "indexer:manage");
    const { id } = req.params as { id: string };
    await store.update((s) => {
      s.indexerConfigs = s.indexerConfigs.filter((c) => c.id !== id);
    });
    return { ok: true, message: "Indexer configuration deleted." };
  });

  app.post("/hub/indexer-configs/:id/run", async (req, reply) => {
    await auth(req, "indexer:run");
    const { id } = req.params as { id: string };
    const s = await store.getState();
    const cfg = s.indexerConfigs.find((c) => c.id === id);
    if (!cfg) {
      return reply.status(404).send({ ok: false, message: "Indexer configuration not found." });
    }
    const inst = s.instances.find(
      (i) => i.id === (cfg.instanceId ?? "") && i.kind === "indexer" && i.enabled,
    );
    if (!inst) {
      return reply.status(400).send({
        ok: false,
        message: "Assign an enabled indexer instance to this configuration before running.",
      });
    }
    const engine = cfg.engineInstanceId
      ? s.instances.find((i) => i.id === cfg.engineInstanceId && i.kind === "engine")
      : undefined;
    const res = await fetch(`${inst.baseUrl}/v1/jobs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(inst.apiKey ? { authorization: `Bearer ${inst.apiKey}` } : {}),
      },
      body: JSON.stringify({
        index: cfg.indexName,
        input: cfg.inputPath,
        batchSize: cfg.batchSize,
        engineUrl: engine?.baseUrl,
        apiKey: engine?.apiKey,
      }),
    });
    const json = await res.json().catch(() => ({}));
    return reply.status(res.status).send(json);
  });

  // Serve UI
  const uiDist =
    options?.uiDist ??
    process.env.ANVESH_HUB_UI_DIST ??
    path.resolve(__dirname, "../ui");
  try {
    await app.register(fastifyStatic, {
      root: uiDist,
      prefix: "/",
      wildcard: false,
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/hub/")) {
        return reply.status(404).send({ ok: false, message: "Hub API route not found." });
      }
      return reply.sendFile("index.html");
    });
  } catch {
    app.get("/", async () => ({
      ok: true,
      message: "Anvesh Hub API is running. Build the UI (npm run build -w @vaagatech/anvesh-hub) to serve the console.",
    }));
  }

  return { app, store };
}

export async function listenHub(options?: {
  dataDir?: string;
  uiDist?: string;
  port?: number;
  host?: string;
}) {
  const { app } = await createHubServer(options);
  const port = options?.port ?? Number(process.env.ANVESH_HUB_PORT ?? 3849);
  const host = options?.host ?? process.env.ANVESH_HUB_HOST ?? "0.0.0.0";
  await app.listen({ port, host });
  // eslint-disable-next-line no-console
  console.log(`Anvesh Hub listening on http://${host}:${port} — by VaagaTech`);
  return app;
}
