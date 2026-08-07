import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import helmet from "@fastify/helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  AdapterUnsupportedError,
  createSearchBackend,
  hubKindToBackendKind,
  isSearchBackendHubKind,
  type AnveshSearchQuery,
} from "@vaagatech/anvesh-search-adapters";
import { HubStore } from "./store.js";
import {
  allowedFieldsForRole,
  can,
  type AuditEntry,
  type HubInstance,
  type HubRole,
  type HubUser,
  type InstanceKind,
  isHubSearchInstanceKind,
  type Permission,
} from "./types.js";
import { validateDocumentsAgainstMappings } from "./validate.js";
import { parseSecretsKey } from "./secrets.js";
import { ensureWebIndex } from "./web-mappings.js";
import { unwrapIndex, unwrapMappings, unwrapDynamicMapping } from "./unwrap.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── helpers ────────────────────────────────────────────────────────────────

function publicUser(u: { id: string; username: string; role: HubRole; createdAt: string }) {
  return { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt };
}

function stripApiKey(inst: HubInstance) {
  const { apiKey: _k, apiKeyEnc: _e, ...rest } = inst;
  return { ...rest, hasApiKey: Boolean(_k || _e) };
}

function instKey(store: HubStore, inst: HubInstance): string | undefined {
  return store.resolveApiKey(inst);
}

const INSTANCE_KINDS = [
  "engine",
  "indexer",
  "spider",
  "elasticsearch",
  "opensearch",
  "solr",
] as const;

function searchBackendFor(store: HubStore, inst: HubInstance) {
  return createSearchBackend({
    kind: hubKindToBackendKind(inst.kind),
    baseUrl: inst.baseUrl,
    apiKey: instKey(store, inst),
  });
}

function findSearchInstance(instances: HubInstance[], instanceId: string) {
  return instances.find((i) => i.id === instanceId && isHubSearchInstanceKind(i.kind));
}

async function checkInstanceHealth(store: HubStore, inst: HubInstance): Promise<boolean> {
  if (isSearchBackendHubKind(inst.kind)) {
    return searchBackendFor(store, inst).health();
  }
  const res = await fetch(`${inst.baseUrl}/health`, {
    headers: instKey(store, inst) ? { authorization: `Bearer ${instKey(store, inst)}` } : {},
    signal: AbortSignal.timeout(4000),
  });
  return res.ok;
}

function stripSearchByAcl(json: unknown, allowed: string[] | null): unknown {
  if (!allowed || !json || typeof json !== "object") return json;
  const body = json as Record<string, unknown>;
  const hits = body.hits;
  if (!Array.isArray(hits)) return json;
  const allow = new Set(allowed);
  return {
    ...body,
    hits: hits.map((hit) => {
      if (!hit || typeof hit !== "object") return hit;
      const h = hit as Record<string, unknown>;
      const source = h.source;
      if (!source || typeof source !== "object") return hit;
      const src = source as Record<string, unknown>;
      const fields = src.fields;
      if (!fields || typeof fields !== "object") return hit;
      const nextFields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
        if (allow.has(k)) nextFields[k] = v;
      }
      return { ...h, source: { ...src, fields: nextFields } };
    }),
  };
}

function parsePageQuery(q: { from?: string; size?: string }, defaultSize = 20, maxSize = 100) {
  const from = Math.max(0, parseInt(q.from ?? "0", 10) || 0);
  const size = Math.min(maxSize, Math.max(1, parseInt(q.size ?? String(defaultSize), 10) || defaultSize));
  return { from, size };
}

async function sweepStaleJobs(store: HubStore, staleMinutes: number): Promise<number> {
  const cutoff = Date.now() - staleMinutes * 60_000;
  let cleared = 0;
  await store.update((s) => {
    for (const job of s.jobs) {
      if (job.status !== "running" && job.status !== "queued") continue;
      if (new Date(job.updatedAt).getTime() > cutoff) continue;
      job.status = "failed";
      job.message = "worker timed out";
      job.updatedAt = new Date().toISOString();
      cleared++;
    }
  });
  return cleared;
}

async function proxyEngine(
  baseUrl: string,
  apiKey: string | undefined,
  method: string,
  urlPath: string,
  body?: unknown,
) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
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

async function audit(
  store: HubStore,
  entry: {
    actor?: HubUser | null;
    action: string;
    target?: string;
    detail?: string;
    ok: boolean;
  },
) {
  const row: AuditEntry = {
    id: randomUUID(),
    at: new Date().toISOString(),
    actorId: entry.actor?.id,
    actorName: entry.actor?.username,
    action: entry.action,
    target: entry.target,
    detail: entry.detail,
    ok: entry.ok,
  };
  await store.update((s) => {
    s.auditLog.push(row);
    if (s.auditLog.length > 500) {
      s.auditLog = s.auditLog.slice(s.auditLog.length - 500);
    }
  });
}

// ─── server factory ──────────────────────────────────────────────────────────

export async function createHubServer(options?: {
  dataDir?: string;
  uiDist?: string;
  port?: number;
  host?: string;
}) {
  const secure = process.env.ANVESH_SECURE === "1";
  const secretsRaw = process.env.ANVESH_HUB_SECRETS_KEY?.trim();
  if (secure && !secretsRaw) {
    throw new Error(
      "ANVESH_SECURE=1 requires ANVESH_HUB_SECRETS_KEY (32-byte hex or base64). Run anvesh-setup init.",
    );
  }
  let secretsKey: Buffer | undefined;
  if (secretsRaw) {
    secretsKey = parseSecretsKey(secretsRaw);
  }

  const dataDir = options?.dataDir ?? process.env.ANVESH_HUB_DATA ?? ".anvesh/hub";
  const store = new HubStore(dataDir, { secretsKey });
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

  // Seed local fleet when empty (skip with ANVESH_HUB_SEED_LOCAL=0)
  const afterAdmin = await store.getState();
  if (afterAdmin.instances.length === 0 && process.env.ANVESH_HUB_SEED_LOCAL !== "0") {
    const enginePort = process.env.ANVESH_PORT ?? "3848";
    const spiderPort = process.env.ANVESH_SPIDER_PORT ?? "3851";
    const indexerPort = process.env.ANVESH_INDEXER_PORT ?? "3852";
    const now = new Date().toISOString();
    const seedRows: Array<Omit<HubInstance, "id" | "createdAt"> & { envKey?: string }> = [
      {
        name: "local-engine",
        kind: "engine",
        baseUrl: `http://127.0.0.1:${enginePort}`,
        enabled: true,
        notes: "Auto-seeded by Hub for local stack",
        envKey: process.env.ANVESH_API_KEY,
      },
      {
        name: "local-spider",
        kind: "spider",
        baseUrl: `http://127.0.0.1:${spiderPort}`,
        enabled: true,
        notes: "Auto-seeded by Hub for local stack",
        envKey: process.env.ANVESH_SPIDER_API_KEY,
      },
      {
        name: "local-indexer",
        kind: "indexer",
        baseUrl: `http://127.0.0.1:${indexerPort}`,
        enabled: true,
        notes: "Auto-seeded by Hub for local stack",
        envKey: process.env.ANVESH_INDEXER_API_KEY,
      },
    ];
    await store.update((s) => {
      for (const row of seedRows) {
        const inst: HubInstance = {
          id: randomUUID(),
          name: row.name,
          kind: row.kind,
          baseUrl: row.baseUrl,
          enabled: row.enabled,
          notes: row.notes,
          createdAt: now,
        };
        if (row.envKey) store.applyInstanceCredential(inst, row.envKey);
        s.instances.push(inst);
      }
    });
    // eslint-disable-next-line no-console
    console.log(
      `Hub bootstrap: seeded local engine (:${enginePort}), spider (:${spiderPort}), indexer (:${indexerPort}).`,
    );
  }

  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, { origin: true });

  const staleMinutes = Math.max(
    1,
    parseInt(process.env.ANVESH_JOB_STALE_MINUTES ?? "30", 10) || 30,
  );
  const staleTimer = setInterval(() => {
    void sweepStaleJobs(store, staleMinutes);
  }, 60_000);
  staleTimer.unref?.();
  void sweepStaleJobs(store, staleMinutes);

  // ─── auth middleware ───────────────────────────────────────────────────────

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
    const session = s.sessions.find(
      (x) => x.token === token && x.expiresAt > new Date().toISOString(),
    );
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

  // ─── error handler ─────────────────────────────────────────────────────────

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.status(400).send({
        ok: false,
        message: err.errors.map((e) => e.message).join("; ") || "Validation failed.",
      });
    }
    const e = err as Error & { statusCode?: number };
    const status = e.statusCode ?? 500;
    reply.status(status).send({
      ok: false,
      message: e.message || "Something went wrong on the Hub.",
    });
  });

  // ─── health ────────────────────────────────────────────────────────────────

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

  // ─── auth ──────────────────────────────────────────────────────────────────

  app.post("/hub/auth/login", async (req, reply) => {
    const body = z
      .object({ username: z.string().min(1), password: z.string().min(1) })
      .parse(req.body);
    const s = await store.getState();
    const user = s.users.find((u) => u.username === body.username);
    if (!user || !HubStore.verifyPassword(user, body.password)) {
      await audit(store, {
        actor: null,
        action: "auth.login",
        target: body.username,
        detail: "Invalid credentials",
        ok: false,
      });
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
    await audit(store, { actor: user, action: "auth.login", target: user.username, ok: true });
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

  app.post("/hub/auth/password", async (req, reply) => {
    const me = await auth(req);
    const minLen = process.env.ANVESH_SECURE === "1" ? 12 : 8;
    const body = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(minLen),
      })
      .parse(req.body);
    const s = await store.getState();
    const user = s.users.find((u) => u.id === me.id);
    if (!user || !HubStore.verifyPassword(user, body.currentPassword)) {
      await audit(store, {
        actor: me,
        action: "auth.password",
        target: me.username,
        detail: "Invalid current password",
        ok: false,
      });
      return reply.status(401).send({ ok: false, message: "Current password is incorrect." });
    }
    const { hash, salt } = HubStore.hashPassword(body.newPassword);
    await store.update((st) => {
      const row = st.users.find((u) => u.id === me.id);
      if (!row) return;
      row.passwordHash = hash;
      row.salt = salt;
      st.sessions = st.sessions.filter((x) => x.userId !== me.id);
    });
    await audit(store, { actor: me, action: "auth.password", target: me.username, ok: true });
    return {
      ok: true,
      message: "Password updated. Sign in again with your new password.",
    };
  });

  // ─── users ─────────────────────────────────────────────────────────────────

  app.get("/hub/users", async (req) => {
    await auth(req, "users:manage");
    const q = req.query as { from?: string; size?: string };
    const { from, size } = parsePageQuery(q, 20, 100);
    const s = await store.getState();
    const sorted = [...s.users].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const total = sorted.length;
    const users = sorted.slice(from, from + size).map(publicUser);
    return { ok: true, users, total, from, size };
  });

  app.post("/hub/users", async (req, reply) => {
    const me = await auth(req, "users:manage");
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
    await audit(store, {
      actor: me,
      action: "user.create",
      target: body.username,
      detail: `role=${body.role}`,
      ok: true,
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
    const s = await store.getState();
    const target = s.users.find((u) => u.id === id);
    await store.update((st) => {
      st.users = st.users.filter((u) => u.id !== id);
      st.sessions = st.sessions.filter((x) => x.userId !== id);
    });
    await audit(store, {
      actor: me,
      action: "user.delete",
      target: target?.username ?? id,
      ok: true,
    });
    return { ok: true, message: "User removed." };
  });

  // ─── instances ─────────────────────────────────────────────────────────────

  app.get("/hub/instances", async (req) => {
    await auth(req, "instances:read");
    const s = await store.getState();
    return {
      ok: true,
      instances: s.instances.map(stripApiKey),
      message: `Tracking ${s.instances.length} application instance(s).`,
    };
  });

  app.post("/hub/instances", async (req, reply) => {
    const me = await auth(req, "instances:manage");
    const body = z
      .object({
        name: z.string().min(1),
        kind: z.enum(INSTANCE_KINDS),
        baseUrl: z.string().url(),
        apiKey: z.string().optional(),
        notes: z.string().optional(),
        enabled: z.boolean().default(true),
      })
      .parse(req.body);
    const baseUrl = body.baseUrl.replace(/\/$/, "");
    const nameKey = body.name.trim().toLowerCase();
    const s0 = await store.getState();
    if (
      s0.instances.some(
        (i) => i.kind === body.kind && i.name.trim().toLowerCase() === nameKey,
      )
    ) {
      return reply.status(409).send({
        ok: false,
        message: `An instance named "${body.name.trim()}" of kind ${body.kind} already exists.`,
      });
    }
    if (s0.instances.some((i) => i.baseUrl.replace(/\/$/, "") === baseUrl)) {
      return reply.status(409).send({
        ok: false,
        message: `An instance with URL ${baseUrl} is already registered.`,
      });
    }
    const instance: HubInstance = {
      id: randomUUID(),
      name: body.name.trim(),
      kind: body.kind as InstanceKind,
      baseUrl,
      enabled: body.enabled,
      notes: body.notes,
      createdAt: new Date().toISOString(),
    };
    if (body.apiKey) store.applyInstanceCredential(instance, body.apiKey);
    await store.update((s) => {
      s.instances.push(instance);
    });
    if (body.apiKey) {
      await audit(store, {
        actor: me,
        action: "instance.credentials.updated",
        target: body.name,
        ok: true,
      });
    }
    await audit(store, {
      actor: me,
      action: "instance.create",
      target: body.name,
      detail: `kind=${body.kind} url=${instance.baseUrl}`,
      ok: true,
    });
    return reply.status(201).send({
      ok: true,
      message: `${body.kind} instance "${body.name}" registered.`,
      instance: stripApiKey(instance),
    });
  });

  app.put("/hub/instances/:id", async (req, reply) => {
    const me = await auth(req, "instances:manage");
    const { id } = req.params as { id: string };
    const body = z
      .object({
        name: z.string().min(1).optional(),
        kind: z.enum(INSTANCE_KINDS).optional(),
        baseUrl: z.string().url().optional(),
        apiKey: z.string().optional(),
        notes: z.string().optional(),
        enabled: z.boolean().optional(),
      })
      .parse(req.body);
    const s0 = await store.getState();
    const existing = s0.instances.find((i) => i.id === id);
    if (!existing) {
      return reply.status(404).send({ ok: false, message: "Instance not found." });
    }
    const nextKind = body.kind ?? existing.kind;
    const nextName = (body.name ?? existing.name).trim();
    const nextUrl = (body.baseUrl ?? existing.baseUrl).replace(/\/$/, "");
    if (
      s0.instances.some(
        (i) =>
          i.id !== id &&
          i.kind === nextKind &&
          i.name.trim().toLowerCase() === nextName.toLowerCase(),
      )
    ) {
      return reply.status(409).send({
        ok: false,
        message: `An instance named "${nextName}" of kind ${nextKind} already exists.`,
      });
    }
    if (s0.instances.some((i) => i.id !== id && i.baseUrl.replace(/\/$/, "") === nextUrl)) {
      return reply.status(409).send({
        ok: false,
        message: `An instance with URL ${nextUrl} is already registered.`,
      });
    }
    let credentialsUpdated = false;
    let updated: HubInstance | null = null;
    await store.update((s) => {
      const inst = s.instances.find((i) => i.id === id);
      if (!inst) return;
      if (body.name !== undefined) inst.name = body.name.trim();
      if (body.kind !== undefined) inst.kind = body.kind;
      if (body.baseUrl !== undefined) inst.baseUrl = body.baseUrl.replace(/\/$/, "");
      if (body.apiKey) {
        store.applyInstanceCredential(inst, body.apiKey);
        credentialsUpdated = true;
      }
      if (body.notes !== undefined) inst.notes = body.notes;
      if (body.enabled !== undefined) inst.enabled = body.enabled;
      inst.updatedAt = new Date().toISOString();
      updated = inst;
    });
    if (credentialsUpdated) {
      await audit(store, {
        actor: me,
        action: "instance.credentials.updated",
        target: (updated as HubInstance | null)?.name ?? id,
        ok: true,
      });
    }
    await audit(store, {
      actor: me,
      action: "instance.update",
      target: (updated as HubInstance | null)?.name ?? id,
      ok: true,
    });
    const s = await store.getState();
    return {
      ok: true,
      message: "Instance updated.",
      instance: stripApiKey(updated!),
      instances: s.instances.map(stripApiKey),
    };
  });

  app.delete("/hub/instances/:id", async (req) => {
    const me = await auth(req, "instances:manage");
    const { id } = req.params as { id: string };
    const s = await store.getState();
    const target = s.instances.find((i) => i.id === id);
    await store.update((st) => {
      st.instances = st.instances.filter((i) => i.id !== id);
    });
    await audit(store, {
      actor: me,
      action: "instance.delete",
      target: target?.name ?? id,
      detail: target ? `kind=${target.kind}` : undefined,
      ok: true,
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
    try {
      const ok = await checkInstanceHealth(store, inst);
      return {
        ok,
        status: ok ? 200 : 503,
        message: ok
          ? `Instance "${inst.name}" is reachable.`
          : `Instance "${inst.name}" is not healthy.`,
      };
    } catch (err) {
      return {
        ok: false,
        message: `Could not reach "${inst.name}": ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });

  // ─── engine indexes ────────────────────────────────────────────────────────

  app.get("/hub/engines/:instanceId/indexes", async (req) => {
    await auth(req, "indexes:read");
    const { instanceId } = req.params as { instanceId: string };
    const s = await store.getState();
    const inst = findSearchInstance(s.instances, instanceId);
    if (!inst) {
      const err = new Error("Search instance not found.");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    if (inst.kind === "engine") {
      const proxied = await proxyEngine(inst.baseUrl, instKey(store, inst), "GET", "/v1/indexes");
      return proxied.json;
    }
    const indexes = await searchBackendFor(store, inst).listIndexes();
    return {
      ok: true,
      indexes,
      message: `Listed ${indexes.length} index(es) from ${inst.kind}.`,
    };
  });

  app.get("/hub/engines/:instanceId/indexes/:name", async (req, reply) => {
    await auth(req, "indexes:read");
    const { instanceId, name } = req.params as { instanceId: string; name: string };
    const s = await store.getState();
    const inst = s.instances.find((i) => i.id === instanceId && i.kind === "engine");
    if (!inst) {
      return reply.status(404).send({ ok: false, message: "Engine instance not found." });
    }
    const proxied = await proxyEngine(
      inst.baseUrl,
      instKey(store, inst),
      "GET",
      `/v1/indexes/${encodeURIComponent(name)}`,
    );
    return reply.status(proxied.status).send(proxied.json);
  });

  app.post("/hub/engines/:instanceId/indexes", async (req, reply) => {
    const me = await auth(req, "indexes:manage");
    const { instanceId } = req.params as { instanceId: string };
    const s = await store.getState();
    const inst = s.instances.find((i) => i.id === instanceId && i.kind === "engine");
    if (!inst) {
      return reply.status(404).send({ ok: false, message: "Engine instance not found." });
    }
    const proxied = await proxyEngine(inst.baseUrl, instKey(store, inst), "POST", "/v1/indexes", req.body);
    await audit(store, {
      actor: me,
      action: "index.create",
      target: `${inst.name}`,
      detail: `instance=${instanceId}`,
      ok: proxied.status < 400,
    });
    return reply.status(proxied.status).send(proxied.json);
  });

  app.delete("/hub/engines/:instanceId/indexes/:name", async (req, reply) => {
    const me = await auth(req, "indexes:manage");
    const { instanceId, name } = req.params as { instanceId: string; name: string };
    const s = await store.getState();
    const inst = s.instances.find((i) => i.id === instanceId && i.kind === "engine");
    if (!inst) {
      return reply.status(404).send({ ok: false, message: "Engine instance not found." });
    }
    const proxied = await proxyEngine(
      inst.baseUrl,
      instKey(store, inst),
      "DELETE",
      `/v1/indexes/${encodeURIComponent(name)}`,
    );
    await audit(store, {
      actor: me,
      action: "index.delete",
      target: name,
      detail: `instance=${inst.name}`,
      ok: proxied.status < 400,
    });
    return reply.status(proxied.status).send(proxied.json);
  });

  app.post("/hub/engines/:instanceId/indexes/:name/search", async (req, reply) => {
    const user = await auth(req, "search:run");
    const { instanceId, name } = req.params as { instanceId: string; name: string };
    const s = await store.getState();
    const inst = findSearchInstance(s.instances, instanceId);
    if (!inst) {
      return reply.status(404).send({ ok: false, message: "Search instance not found." });
    }
    if (inst.kind === "engine") {
      const proxied = await proxyEngine(
        inst.baseUrl,
        instKey(store, inst),
        "POST",
        `/v1/indexes/${encodeURIComponent(name)}/search`,
        req.body,
      );
      const allowed = allowedFieldsForRole(user.role, s.roleFieldAcl);
      const body = stripSearchByAcl(proxied.json, allowed);
      return reply.status(proxied.status).send(body);
    }
    try {
      const result = await searchBackendFor(store, inst).search(
        name,
        req.body as AnveshSearchQuery,
      );
      const allowed = allowedFieldsForRole(user.role, s.roleFieldAcl);
      const body = stripSearchByAcl({ ok: true, ...result }, allowed);
      return reply.send(body);
    } catch (err) {
      if (err instanceof AdapterUnsupportedError) {
        return reply.status(501).send({ ok: false, message: err.message, code: err.code });
      }
      throw err;
    }
  });

  app.post("/hub/engines/:instanceId/indexes/:name/documents", async (req, reply) => {
    const me = await auth(req, "indexes:manage");
    const { instanceId, name } = req.params as { instanceId: string; name: string };
    const s = await store.getState();
    const inst = s.instances.find((i) => i.id === instanceId && i.kind === "engine");
    if (!inst) {
      return reply.status(404).send({ ok: false, message: "Engine instance not found." });
    }
    const proxied = await proxyEngine(
      inst.baseUrl,
      instKey(store, inst),
      "POST",
      `/v1/indexes/${encodeURIComponent(name)}/documents`,
      req.body,
    );
    await audit(store, {
      actor: me,
      action: "document.ingest",
      target: name,
      detail: `instance=${inst.name}`,
      ok: proxied.status < 400,
    });
    return reply.status(proxied.status).send(proxied.json);
  });

  app.get("/hub/engines/:instanceId/indexes/:name/documents", async (req, reply) => {
    await auth(req, "search:run");
    const { instanceId, name } = req.params as { instanceId: string; name: string };
    const q = req.query as { from?: string; size?: string };
    const s = await store.getState();
    const inst = s.instances.find((i) => i.id === instanceId && i.kind === "engine");
    if (!inst) {
      return reply.status(404).send({ ok: false, message: "Engine instance not found." });
    }
    const qs = new URLSearchParams();
    if (q.from) qs.set("from", q.from);
    if (q.size) qs.set("size", q.size);
    const suffix = qs.toString() ? `?${qs}` : "";
    const proxied = await proxyEngine(
      inst.baseUrl,
      instKey(store, inst),
      "GET",
      `/v1/indexes/${encodeURIComponent(name)}/documents${suffix}`,
    );
    return reply.status(proxied.status).send(proxied.json);
  });

  app.delete("/hub/engines/:instanceId/indexes/:name/documents/:id", async (req, reply) => {
    const me = await auth(req, "indexes:manage");
    const { instanceId, name, id } = req.params as {
      instanceId: string;
      name: string;
      id: string;
    };
    const s = await store.getState();
    const inst = s.instances.find((i) => i.id === instanceId && i.kind === "engine");
    if (!inst) {
      return reply.status(404).send({ ok: false, message: "Engine instance not found." });
    }
    const proxied = await proxyEngine(
      inst.baseUrl,
      instKey(store, inst),
      "DELETE",
      `/v1/indexes/${encodeURIComponent(name)}/documents/${encodeURIComponent(id)}`,
    );
    await audit(store, {
      actor: me,
      action: "document.delete",
      target: `${name}/${id}`,
      detail: `instance=${inst.name}`,
      ok: proxied.status < 400,
    });
    return reply.status(proxied.status).send(proxied.json);
  });

  app.delete("/hub/engines/:instanceId/indexes/:name/documents", async (req, reply) => {
    const me = await auth(req, "indexes:manage");
    const { instanceId, name } = req.params as { instanceId: string; name: string };
    const s = await store.getState();
    const inst = s.instances.find((i) => i.id === instanceId && i.kind === "engine");
    if (!inst) {
      return reply.status(404).send({ ok: false, message: "Engine instance not found." });
    }
    const proxied = await proxyEngine(
      inst.baseUrl,
      instKey(store, inst),
      "DELETE",
      `/v1/indexes/${encodeURIComponent(name)}/documents`,
    );
    await audit(store, {
      actor: me,
      action: "document.clear",
      target: name,
      detail: `instance=${inst.name}`,
      ok: proxied.status < 400,
    });
    return reply.status(proxied.status).send(proxied.json);
  });

  // ─── validate documents against index mappings ────────────────────────────

  app.post("/hub/engines/:instanceId/indexes/:name/validate", async (req, reply) => {
    await auth(req, "indexes:manage");
    const { instanceId, name } = req.params as { instanceId: string; name: string };
    const body = z
      .object({ documents: z.array(z.record(z.unknown())) })
      .parse(req.body);
    const s = await store.getState();
    const inst = s.instances.find((i) => i.id === instanceId && i.kind === "engine");
    if (!inst) {
      return reply.status(404).send({ ok: false, message: "Engine instance not found." });
    }
    const indexDetail = await proxyEngine(
      inst.baseUrl,
      instKey(store, inst),
      "GET",
      `/v1/indexes/${encodeURIComponent(name)}`,
    );
    if (indexDetail.status >= 400) {
      return reply.status(indexDetail.status).send({
        ok: false,
        message: "Could not fetch index mappings from engine.",
        upstream: indexDetail.json,
      });
    }
    const mappings = unwrapMappings(indexDetail.json);
    if (!mappings) {
      return reply.status(502).send({ ok: false, message: "Engine returned no mappings for this index." });
    }
    const result = validateDocumentsAgainstMappings(
      mappings as Parameters<typeof validateDocumentsAgainstMappings>[0],
      body.documents as Parameters<typeof validateDocumentsAgainstMappings>[1],
      { allowUnknownFields: unwrapDynamicMapping(indexDetail.json) },
    );
    return reply.status(result.ok ? 200 : 422).send({ ok: result.ok, issues: result.issues });
  });

  // ─── ingest with optional validation ──────────────────────────────────────

  app.post("/hub/engines/:instanceId/indexes/:name/ingest", async (req, reply) => {
    const me = await auth(req, "indexes:manage");
    const { instanceId, name } = req.params as { instanceId: string; name: string };
    const body = z
      .object({
        documents: z.array(z.record(z.unknown())),
        validate: z.boolean().default(true),
      })
      .parse(req.body);
    const s = await store.getState();
    const inst = s.instances.find((i) => i.id === instanceId && i.kind === "engine");
    if (!inst) {
      return reply.status(404).send({ ok: false, message: "Engine instance not found." });
    }

    if (body.validate) {
      const indexDetail = await proxyEngine(
        inst.baseUrl,
        instKey(store, inst),
        "GET",
        `/v1/indexes/${encodeURIComponent(name)}`,
      );
      if (indexDetail.status < 400) {
        const mappings = unwrapMappings(indexDetail.json) as
          | Parameters<typeof validateDocumentsAgainstMappings>[0]
          | undefined;
        if (mappings) {
          const result = validateDocumentsAgainstMappings(
            mappings,
            body.documents as Parameters<typeof validateDocumentsAgainstMappings>[1],
            { allowUnknownFields: unwrapDynamicMapping(indexDetail.json) },
          );
          if (!result.ok) {
            await audit(store, {
              actor: me,
              action: "document.ingest",
              target: name,
              detail: `instance=${inst.name} validation_failed issues=${result.issues.length}`,
              ok: false,
            });
            return reply.status(400).send({
              ok: false,
              message: `Validation failed with ${result.issues.length} issue(s). Fix them or set validate=false to skip.`,
              issues: result.issues,
            });
          }
        } else {
          return reply.status(502).send({
            ok: false,
            message: "Engine returned no mappings for this index; cannot validate.",
          });
        }
      }
    }

    const proxied = await proxyEngine(
      inst.baseUrl,
      instKey(store, inst),
      "POST",
      `/v1/indexes/${encodeURIComponent(name)}/documents/_bulk`,
      { documents: body.documents },
    );
    await audit(store, {
      actor: me,
      action: "document.ingest",
      target: name,
      detail: `instance=${inst.name} count=${body.documents.length}`,
      ok: proxied.status < 400,
    });
    return reply.status(proxied.status).send(proxied.json);
  });

  // ─── spider configs ────────────────────────────────────────────────────────

  app.get("/hub/spider-configs", async (req) => {
    await auth(req, "spider:manage");
    const s = await store.getState();
    return { ok: true, configs: s.spiderConfigs };
  });

  app.post("/hub/spider-configs", async (req, reply) => {
    const me = await auth(req, "spider:manage");
    const body = z
      .object({
        name: z.string().min(1),
        description: z.string().optional(),
        instanceId: z.string().optional(),
        indexName: z.string().optional(),
        autoIndex: z.boolean().default(true),
        indexerInstanceId: z.string().optional(),
        engineInstanceId: z.string().optional(),
        config: z.record(z.unknown()),
      })
      .parse(req.body);
    const nameKey = body.name.trim().toLowerCase();
    const s0 = await store.getState();
    if (s0.spiderConfigs.some((c) => c.name.trim().toLowerCase() === nameKey)) {
      return reply.status(409).send({
        ok: false,
        message: `A crawl named "${body.name.trim()}" already exists. Choose a unique name.`,
      });
    }
    // Index lives on the row only — strip duplicates from nested config JSON.
    const { indexName: _cfgIndex, outputPath: _out, ...cleanConfig } = body.config as Record<
      string,
      unknown
    >;
    const indexName = (body.indexName ?? "").trim() || undefined;
    const row = {
      id: randomUUID(),
      name: body.name.trim(),
      description: body.description,
      instanceId: body.instanceId,
      indexName,
      autoIndex: true,
      indexerInstanceId: body.indexerInstanceId,
      engineInstanceId: body.engineInstanceId,
      config: cleanConfig,
      updatedAt: new Date().toISOString(),
    };
    await store.update((s) => {
      s.spiderConfigs.push(row);
    });
    await audit(store, { actor: me, action: "spider.config.create", target: row.name, ok: true });
    return reply.status(201).send({
      ok: true,
      message: `Spider configuration "${row.name}" saved.`,
      config: row,
    });
  });

  app.put("/hub/spider-configs/:id", async (req, reply) => {
    const me = await auth(req, "spider:manage");
    const { id } = req.params as { id: string };
    const body = z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        instanceId: z.string().optional(),
        indexName: z.string().nullable().optional(),
        autoIndex: z.boolean().optional(),
        indexerInstanceId: z.string().optional(),
        engineInstanceId: z.string().optional(),
        config: z.record(z.unknown()).optional(),
      })
      .parse(req.body);
    if (body.name) {
      const nameKey = body.name.trim().toLowerCase();
      const s0 = await store.getState();
      if (
        s0.spiderConfigs.some(
          (c) => c.id !== id && c.name.trim().toLowerCase() === nameKey,
        )
      ) {
        return reply.status(409).send({
          ok: false,
          message: `A crawl named "${body.name.trim()}" already exists. Choose a unique name.`,
        });
      }
    }
    let updated = null as unknown;
    await store.update((s) => {
      const row = s.spiderConfigs.find((c) => c.id === id);
      if (!row) return;
      if (body.name) row.name = body.name.trim();
      if (body.description !== undefined) row.description = body.description;
      if (body.instanceId !== undefined) row.instanceId = body.instanceId || undefined;
      if (body.indexName !== undefined) {
        const v = (body.indexName ?? "").trim();
        row.indexName = v || undefined;
      }
      row.autoIndex = true;
      if (body.indexerInstanceId !== undefined) {
        row.indexerInstanceId = body.indexerInstanceId || undefined;
      }
      if (body.engineInstanceId !== undefined) {
        row.engineInstanceId = body.engineInstanceId || undefined;
      }
      if (body.config) {
        const { indexName: _i, outputPath: _o, ...clean } = body.config as Record<string, unknown>;
        row.config = clean;
      }
      row.updatedAt = new Date().toISOString();
      updated = row;
    });
    if (!updated) {
      const err = new Error("Spider configuration not found.");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    await audit(store, {
      actor: me,
      action: "spider.config.update",
      target: (updated as { name: string }).name,
      ok: true,
    });
    return { ok: true, message: "Spider configuration updated.", config: updated };
  });

  app.delete("/hub/spider-configs/:id", async (req) => {
    const me = await auth(req, "spider:manage");
    const { id } = req.params as { id: string };
    const s = await store.getState();
    const cfg = s.spiderConfigs.find((c) => c.id === id);
    await store.update((st) => {
      st.spiderConfigs = st.spiderConfigs.filter((c) => c.id !== id);
    });
    await audit(store, {
      actor: me,
      action: "spider.config.delete",
      target: cfg?.name ?? id,
      ok: true,
    });
    return { ok: true, message: "Spider configuration deleted." };
  });

  app.post("/hub/spider-configs/:id/run", async (req, reply) => {
    const me = await auth(req, "spider:run");
    const { id } = req.params as { id: string };
    const body = z.object({ indexName: z.string().min(1).optional() }).parse(req.body ?? {});
    const s = await store.getState();
    const cfg = s.spiderConfigs.find((c) => c.id === id);
    if (!cfg) {
      return reply.status(404).send({ ok: false, message: "Spider configuration not found." });
    }
    const inst = s.instances.find(
      (i) => i.id === (cfg.instanceId ?? "") && i.kind === "spider" && i.enabled,
    );
    if (!inst) {
      const hasDisabled = s.instances.find(
        (i) => i.id === (cfg.instanceId ?? "") && i.kind === "spider",
      );
      const msg = hasDisabled
        ? `Spider instance "${hasDisabled.name}" is disabled. Enable it in Instances before running.`
        : cfg.instanceId
          ? `Spider instance "${cfg.instanceId}" was not found. It may have been removed. Open this configuration and assign an active spider instance.`
          : "No spider instance assigned. Open this configuration and set an enabled spider instance (e.g. http://127.0.0.1:3851) in the Instances panel, then assign it here.";
      await audit(store, { actor: me, action: "spider.run", target: cfg.name, detail: msg, ok: false });
      return reply.status(400).send({ ok: false, message: msg });
    }
    const indexer = cfg.indexerInstanceId
      ? s.instances.find((i) => i.id === cfg.indexerInstanceId && i.kind === "indexer" && i.enabled)
      : s.instances.find((i) => i.kind === "indexer" && i.enabled);
    const engine = cfg.engineInstanceId
      ? s.instances.find((i) => i.id === cfg.engineInstanceId && i.kind === "engine" && i.enabled)
      : s.instances.find((i) => i.kind === "engine" && i.enabled);

    const indexName =
      (body.indexName || cfg.indexName || "").trim() ||
      (typeof cfg.config.indexName === "string" ? cfg.config.indexName.trim() : "");

    if (!indexName) {
      const msg =
        "Pick or type an index name before running. Hub creates it on the engine if missing.";
      await audit(store, { actor: me, action: "spider.run", target: cfg.name, detail: msg, ok: false });
      return reply.status(400).send({ ok: false, message: msg });
    }

    if (!indexer || !engine) {
      const msg =
        "Need an enabled indexer (:3852) and engine (:3848) to index crawl results. Run npm start or register them under Instances.";
      await audit(store, { actor: me, action: "spider.run", target: cfg.name, detail: msg, ok: false });
      return reply.status(400).send({ ok: false, message: msg });
    }

    try {
      const ensured = await ensureWebIndex(engine.baseUrl, indexName, instKey(store, engine));
      if (ensured.created) {
        await audit(store, {
          actor: me,
          action: "index.create",
          target: indexName,
          detail: `auto-created for crawl "${cfg.name}"`,
          ok: true,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await audit(store, { actor: me, action: "spider.run", target: cfg.name, detail: msg, ok: false });
      return reply.status(400).send({ ok: false, message: msg });
    }

    const crawlConfig = {
      ...cfg.config,
      indexName,
      autoIndex: true,
    };

    const res = await fetch(`${inst.baseUrl}/v1/jobs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(instKey(store, inst) ? { authorization: `Bearer ${instKey(store, inst)}` } : {}),
      },
      body: JSON.stringify({
        config: crawlConfig,
        autoIndex: {
          enabled: true,
          index: indexName,
          engineUrl: engine.baseUrl,
          apiKey: instKey(store, engine),
          indexerUrl: indexer.baseUrl,
          indexerApiKey: instKey(store, indexer),
        },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) {
      const remoteJobId = (json.jobId ?? json.id ?? json.job_id) as string | undefined;
      const job = {
        id: randomUUID(),
        kind: "spider" as const,
        status: "running" as const,
        message: `Spider "${cfg.name}" started — indexing into "${indexName}".`,
        configId: cfg.id,
        configName: cfg.name,
        instanceId: inst.id,
        remoteJobId,
        indexName,
        logs: [] as string[],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: me.id,
      };
      await store.update((st) => {
        st.jobs.push(job);
      });
      await audit(store, {
        actor: me,
        action: "spider.run",
        target: cfg.name,
        detail: `instance=${inst.name} index=${indexName} autoIndex=true remoteJobId=${remoteJobId ?? "unknown"}`,
        ok: true,
      });
      return reply.status(res.status).send({ ...json, hubJobId: job.id, indexName });
    }
    await audit(store, {
      actor: me,
      action: "spider.run",
      target: cfg.name,
      detail: `instance=${inst.name} status=${res.status}`,
      ok: false,
    });
    return reply.status(res.status).send(json);
  });

  // ─── indexer configs ───────────────────────────────────────────────────────

  app.get("/hub/indexer-configs", async (req) => {
    await auth(req, "indexer:manage");
    const s = await store.getState();
    return { ok: true, configs: s.indexerConfigs };
  });

  app.post("/hub/indexer-configs", async (req, reply) => {
    const me = await auth(req, "indexer:manage");
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
    const nameKey = body.name.trim().toLowerCase();
    const s0 = await store.getState();
    if (s0.indexerConfigs.some((c) => c.name.trim().toLowerCase() === nameKey)) {
      return reply.status(409).send({
        ok: false,
        message: `An indexer config named "${body.name.trim()}" already exists.`,
      });
    }
    const row = {
      id: randomUUID(),
      ...body,
      name: body.name.trim(),
      updatedAt: new Date().toISOString(),
    };
    await store.update((s) => {
      s.indexerConfigs.push(row);
    });
    await audit(store, {
      actor: me,
      action: "indexer.config.create",
      target: body.name,
      ok: true,
    });
    return reply.status(201).send({
      ok: true,
      message: `Indexer configuration "${body.name}" saved.`,
      config: row,
    });
  });

  app.put("/hub/indexer-configs/:id", async (req) => {
    const me = await auth(req, "indexer:manage");
    const { id } = req.params as { id: string };
    const body = z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        instanceId: z.string().optional(),
        engineInstanceId: z.string().optional(),
        indexName: z.string().min(1).optional(),
        inputPath: z.string().optional(),
        batchSize: z.number().int().positive().optional(),
      })
      .parse(req.body);
    let updated = null as unknown;
    await store.update((s) => {
      const row = s.indexerConfigs.find((c) => c.id === id);
      if (!row) return;
      if (body.name) row.name = body.name;
      if (body.description !== undefined) row.description = body.description;
      if (body.instanceId !== undefined) row.instanceId = body.instanceId || undefined;
      if (body.engineInstanceId !== undefined)
        row.engineInstanceId = body.engineInstanceId || undefined;
      if (body.indexName) row.indexName = body.indexName;
      if (body.inputPath !== undefined) row.inputPath = body.inputPath;
      if (body.batchSize !== undefined) row.batchSize = body.batchSize;
      row.updatedAt = new Date().toISOString();
      updated = row;
    });
    if (!updated) {
      const err = new Error("Indexer configuration not found.");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    await audit(store, {
      actor: me,
      action: "indexer.config.update",
      target: (updated as { name: string }).name,
      ok: true,
    });
    return { ok: true, message: "Indexer configuration updated.", config: updated };
  });

  app.delete("/hub/indexer-configs/:id", async (req) => {
    const me = await auth(req, "indexer:manage");
    const { id } = req.params as { id: string };
    const s = await store.getState();
    const cfg = s.indexerConfigs.find((c) => c.id === id);
    await store.update((st) => {
      st.indexerConfigs = st.indexerConfigs.filter((c) => c.id !== id);
    });
    await audit(store, {
      actor: me,
      action: "indexer.config.delete",
      target: cfg?.name ?? id,
      ok: true,
    });
    return { ok: true, message: "Indexer configuration deleted." };
  });

  app.post("/hub/indexer-configs/:id/run", async (req, reply) => {
    const me = await auth(req, "indexer:run");
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
      const hasDisabled = s.instances.find(
        (i) => i.id === (cfg.instanceId ?? "") && i.kind === "indexer",
      );
      const msg = hasDisabled
        ? `Indexer instance "${hasDisabled.name}" is disabled. Enable it in Instances before running.`
        : cfg.instanceId
          ? `Indexer instance "${cfg.instanceId}" was not found. It may have been removed. Open this configuration and assign an active indexer instance.`
          : "No indexer instance assigned. Open this configuration and set an enabled indexer instance (e.g. http://127.0.0.1:3852) in the Instances panel, then assign it here.";
      await audit(store, {
        actor: me,
        action: "indexer.run",
        target: cfg.name,
        detail: msg,
        ok: false,
      });
      return reply.status(400).send({ ok: false, message: msg });
    }
    const engine = cfg.engineInstanceId
      ? s.instances.find((i) => i.id === cfg.engineInstanceId && i.kind === "engine")
      : undefined;
    const res = await fetch(`${inst.baseUrl}/v1/jobs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(instKey(store, inst) ? { authorization: `Bearer ${instKey(store, inst)}` } : {}),
      },
      body: JSON.stringify({
        index: cfg.indexName,
        input: cfg.inputPath,
        batchSize: cfg.batchSize,
        engineUrl: engine?.baseUrl,
        apiKey: engine ? instKey(store, engine) : undefined,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) {
      const remoteJobId = (json.jobId ?? json.id ?? json.job_id) as string | undefined;
      const job = {
        id: randomUUID(),
        kind: "indexer" as const,
        status: "running" as const,
        message: `Indexer "${cfg.name}" started on instance "${inst.name}".`,
        configId: cfg.id,
        configName: cfg.name,
        instanceId: inst.id,
        remoteJobId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: me.id,
      };
      await store.update((st) => {
        st.jobs.push(job);
      });
      await audit(store, {
        actor: me,
        action: "indexer.run",
        target: cfg.name,
        detail: `instance=${inst.name} remoteJobId=${remoteJobId ?? "unknown"}`,
        ok: true,
      });
      return reply.status(res.status).send({ ...json, hubJobId: job.id });
    }
    await audit(store, {
      actor: me,
      action: "indexer.run",
      target: cfg.name,
      detail: `instance=${inst.name} status=${res.status}`,
      ok: false,
    });
    return reply.status(res.status).send(json);
  });

  // ─── jobs ──────────────────────────────────────────────────────────────────

  app.get("/hub/jobs", async (req) => {
    await auth(req, "jobs:read");
    await sweepStaleJobs(store, staleMinutes);
    const q = req.query as { from?: string; size?: string; status?: string };
    const { from, size } = parsePageQuery(q, 20, 100);
    const s = await store.getState();
    let jobs = [...s.jobs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    if (q.status) {
      const status = q.status.toLowerCase();
      jobs = jobs.filter((j) => j.status === status);
    }
    const total = jobs.length;
    const page = jobs.slice(from, from + size);
    return { ok: true, jobs: page, total, from, size };
  });

  app.post("/hub/jobs/:id/cancel", async (req, reply) => {
    const me = await auth(req, "jobs:manage");
    const { id } = req.params as { id: string };
    const s = await store.getState();
    const job = s.jobs.find((j) => j.id === id);
    if (!job) {
      return reply.status(404).send({ ok: false, message: "Job not found." });
    }
    if (job.status !== "running" && job.status !== "queued") {
      return reply.status(400).send({
        ok: false,
        message: `Job is already ${job.status} and cannot be cancelled.`,
      });
    }
    await store.update((st) => {
      const j = st.jobs.find((x) => x.id === id);
      if (!j) return;
      j.status = "cancelled";
      j.message = "Cancelled by operator.";
      j.updatedAt = new Date().toISOString();
    });
    await audit(store, { actor: me, action: "job.cancel", target: id, ok: true });
    const updated = (await store.getState()).jobs.find((j) => j.id === id);
    return { ok: true, message: "Job cancelled.", job: updated };
  });

  app.delete("/hub/jobs/:id", async (req) => {
    const me = await auth(req, "jobs:manage");
    const { id } = req.params as { id: string };
    let removed = false;
    await store.update((st) => {
      const before = st.jobs.length;
      st.jobs = st.jobs.filter((j) => j.id !== id);
      removed = st.jobs.length < before;
    });
    if (!removed) {
      const err = new Error("Job not found.");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    await audit(store, { actor: me, action: "job.delete", target: id, ok: true });
    return { ok: true, message: "Job removed from Hub history." };
  });

  app.post("/hub/jobs/clear-finished", async (req) => {
    const me = await auth(req, "jobs:read");
    let cleared = 0;
    await store.update((st) => {
      const before = st.jobs.length;
      st.jobs = st.jobs.filter((j) => j.status === "running" || j.status === "queued");
      cleared = before - st.jobs.length;
    });
    await audit(store, {
      actor: me,
      action: "job.clearFinished",
      detail: `cleared=${cleared}`,
      ok: true,
    });
    return { ok: true, message: `Cleared ${cleared} finished job(s).`, cleared };
  });

  app.post("/hub/fleet/health", async (req) => {
    await auth(req, "instances:read");
    const s = await store.getState();
    const results = await Promise.all(
      s.instances.map(async (inst) => {
        const started = Date.now();
        try {
          const ok = await checkInstanceHealth(store, inst);
          return {
            id: inst.id,
            name: inst.name,
            kind: inst.kind,
            enabled: inst.enabled,
            ok,
            status: ok ? 200 : 503,
            latencyMs: Date.now() - started,
            message: ok ? "Reachable" : "Unhealthy",
          };
        } catch (err) {
          return {
            id: inst.id,
            name: inst.name,
            kind: inst.kind,
            enabled: inst.enabled,
            ok: false,
            status: 0,
            latencyMs: Date.now() - started,
            message: err instanceof Error ? err.message : "Unreachable",
          };
        }
      }),
    );
    const online = results.filter((r) => r.ok).length;
    return {
      ok: true,
      online,
      total: results.length,
      results,
      message: `${online}/${results.length} instance(s) reachable.`,
    };
  });

  app.post("/hub/jobs/:id/refresh", async (req, reply) => {
    const me = await auth(req, "jobs:read");
    const { id } = req.params as { id: string };
    const s = await store.getState();
    const job = s.jobs.find((j) => j.id === id);
    if (!job) {
      return reply.status(404).send({ ok: false, message: "Job not found." });
    }
    if (!job.remoteJobId) {
      return reply.status(400).send({ ok: false, message: "This job has no remote job ID to poll." });
    }
    const inst = job.instanceId ? s.instances.find((i) => i.id === job.instanceId) : undefined;
    if (!inst) {
      return reply.status(400).send({
        ok: false,
        message: "Could not find the instance that ran this job. It may have been removed.",
      });
    }
    let refreshed = job;
    try {
      const res = await fetch(
        `${inst.baseUrl}/v1/jobs/${encodeURIComponent(job.remoteJobId)}`,
        {
          headers: instKey(store, inst) ? { authorization: `Bearer ${instKey(store, inst)}` } : {},
        },
      );
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || json.ok === false) {
        if (job.status === "completed" || job.status === "failed") {
          return { ok: true, job };
        }
        await store.update((st) => {
          const j = st.jobs.find((x) => x.id === id);
          if (!j) return;
          j.status = "failed";
          j.message = (json.message as string | undefined) || "Worker process restarted during job.";
          j.updatedAt = new Date().toISOString();
          refreshed = j;
        });
        return { ok: true, job: refreshed };
      }

      const remoteStatus = (json.status ?? json.state) as string | undefined;
      const statusMap: Record<string, "queued" | "running" | "completed" | "failed" | "unknown"> =
        {
          queued: "queued",
          pending: "queued",
          running: "running",
          in_progress: "running",
          completed: "completed",
          done: "completed",
          succeeded: "completed",
          failed: "failed",
          error: "failed",
        };
      const mappedStatus =
        remoteStatus != null ? (statusMap[remoteStatus.toLowerCase()] ?? "unknown") : "unknown";
      await store.update((st) => {
        const j = st.jobs.find((x) => x.id === id);
        if (!j) return;
        j.status = mappedStatus;
        j.message = (json.message as string | undefined) || j.message;
        j.output = json.output as string | undefined;
        if (Array.isArray(json.logs)) j.logs = json.logs as string[];
        if (typeof json.pages === "number") j.pagesIndexed = json.pages as number;
        if (typeof json.indexed === "number") j.pagesIndexed = json.indexed as number;
        if (typeof json.indexName === "string") j.indexName = json.indexName as string;
        j.updatedAt = new Date().toISOString();
        refreshed = j;
      });
    } catch (err) {
      return reply.status(502).send({
        ok: false,
        message: `Could not reach instance "${inst.name}": ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    void me; // actor captured for potential future audit
    return { ok: true, message: "Job status refreshed.", job: refreshed };
  });

  // ─── audit log ─────────────────────────────────────────────────────────────

  app.get("/hub/audit", async (req) => {
    await auth(req, "audit:read");
    const q = req.query as { from?: string; size?: string };
    const { from, size } = parsePageQuery(q, 20, 100);
    const s = await store.getState();
    const sorted = [...s.auditLog].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
    const total = sorted.length;
    const entries = sorted.slice(from, from + size);
    return { ok: true, entries, total, from, size };
  });

  // ─── serve UI ──────────────────────────────────────────────────────────────

  const uiDist =
    options?.uiDist ?? process.env.ANVESH_HUB_UI_DIST ?? path.resolve(__dirname, "../ui");
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
      const pathname = req.url.split("?")[0];
      if (
        pathname.startsWith("/assets/") ||
        /\.(js|css|json|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|map)$/i.test(pathname)
      ) {
        return reply.status(404).send({ ok: false, message: "Asset not found." });
      }
      return reply.sendFile("index.html");
    });
  } catch {
    app.get("/", async () => ({
      ok: true,
      message:
        "Anvesh Hub API is running. Build the UI (npm run build -w @vaagatech/anvesh-hub) to serve the console.",
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
  await app.listen({
    port,
    host,
    listenTextResolver: (address) => `http://${host}:${port}`,
  });
  // eslint-disable-next-line no-console
  console.log(`Anvesh Hub listening on http://${host}:${port} — by VaagaTech`);

  const gracefulShutdown = async () => {
    // eslint-disable-next-line no-console
    console.log("Shutting down Hub server gracefully...");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);

  process.on("uncaughtException", (err) => {
    // eslint-disable-next-line no-console
    console.error("Hub uncaughtException:", err);
    process.exit(1);
  });
  process.on("unhandledRejection", (err) => {
    // eslint-disable-next-line no-console
    console.error("Hub unhandledRejection:", err);
    process.exit(1);
  });

  return app;
}
