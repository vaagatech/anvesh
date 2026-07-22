import { randomUUID } from "node:crypto";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { AnveshEngine } from "../core/engine.js";
import { globalCircuits } from "../core/circuit.js";
import { AnveshError, apiEnvelope, formatMessage } from "../messaging/vaakly.js";
import { createLogger, getLogger, logMessage } from "../logging/logger.js";
import { createEnginePluginRegistry } from "../plugins/load.js";
import { createStorage, type StorageKind } from "../storage/index.js";
import type { JsonValue } from "../types.js";
import {
  bulkIndexSchema,
  createIndexSchema,
  indexDocumentSchema,
  searchSchema,
  suggestSchema,
  updateByQuerySchema,
} from "./schemas.js";
import { z } from "zod";

export interface AnveshServerOptions {
  storage?: StorageKind;
  dataDir?: string;
  apiKey?: string;
  corsOrigin?: string | boolean | string[];
  rateLimitMax?: number;
  enableHubStatic?: boolean;
  hubDistPath?: string;
  loggerPretty?: boolean;
  /** Plugin ids to enable (default: env ANVESH_PLUGINS or `vaakly`). */
  plugins?: string[];
}

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function createAnveshApp(options: AnveshServerOptions = {}): Promise<{
  app: FastifyInstance;
  engine: AnveshEngine;
  plugins: ReturnType<typeof createEnginePluginRegistry>;
}> {
  createLogger({ pretty: options.loggerPretty });
  const storageKind = (options.storage ??
    (process.env.ANVESH_STORAGE as StorageKind | undefined) ??
    "filesystem") as StorageKind;

  const storage = createStorage({
    kind: storageKind,
    path: options.dataDir ?? process.env.ANVESH_DATA_DIR,
    bucket: process.env.ANVESH_S3_BUCKET,
    prefix: process.env.ANVESH_S3_PREFIX,
    redisUrl: process.env.REDIS_URL,
    tableName: process.env.ANVESH_DDB_TABLE,
    mongoUrl: process.env.ANVESH_MONGO_URL,
    mongoDb: process.env.ANVESH_MONGO_DB,
  });

  const engine = new AnveshEngine(storage);
  await engine.init();

  const plugins = createEnginePluginRegistry({
    plugins: options.plugins,
    host: "anvesh-engine",
  });

  const maxBody = globalCircuits.config.maxBodyBytes;
  const app = Fastify({
    logger: false,
    trustProxy: true,
    bodyLimit: maxBody,
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
  });

  app.setErrorHandler((err, req, reply) => {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 413) {
      globalCircuits.tripped.body = (globalCircuits.tripped.body ?? 0) + 1;
      return reply.status(413).send({
        ok: false,
        code: "ERR_CIRCUIT_BODY",
        message: `Request body too large (max ${maxBody} bytes).`,
        requestId: req.requestId,
      });
    }
    return sendError(reply, err, req.requestId);
  });

  await app.register(cors, {
    origin: options.corsOrigin ?? process.env.ANVESH_CORS_ORIGIN ?? true,
  });

  await app.register(rateLimit, {
    max: options.rateLimitMax ?? Number(process.env.ANVESH_RATE_LIMIT ?? 120),
    timeWindow: "1 minute",
    errorResponseBuilder: () => {
      const m = formatMessage("ERR_RATE_LIMIT");
      return { ok: false, code: "ERR_RATE_LIMIT", message: m.message };
    },
  });

  const apiKey = options.apiKey ?? process.env.ANVESH_API_KEY;

  app.addHook("onRequest", async (req, reply) => {
    req.requestId = (req.id as string) || randomUUID();
    reply.header("x-request-id", req.requestId);
    reply.header("x-anvesh-version", "0.1.0");
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-frame-options", "DENY");

    if (!apiKey) return;
    if (req.url.startsWith("/health") || req.url.startsWith("/ready")) return;
    // Hub UI assets are public; API under /v1 requires key
    if (!req.url.startsWith("/v1")) return;

    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ")
      ? header.slice(7)
      : (req.headers["x-api-key"] as string | undefined) ?? "";

    if (!token || !timingSafeEqual(token, apiKey)) {
      const m = formatMessage("ERR_UNAUTHORIZED");
      logMessage("ERR_UNAUTHORIZED", {}, { requestId: req.requestId });
      return reply.status(401).send({ ok: false, code: "ERR_UNAUTHORIZED", message: m.message });
    }
  });

  const sendError = (reply: FastifyReply, err: unknown, requestId: string) => {
    if (err instanceof AnveshError) {
      logMessage(err.code, err.details ?? {}, { requestId });
      return reply.status(err.httpStatus).send({
        ok: false,
        code: err.code,
        message: err.message,
        requestId,
      });
    }
    const circuit = err as Error & { code?: string; httpStatus?: number };
    if (circuit?.code?.startsWith("ERR_CIRCUIT_") && circuit.httpStatus) {
      getLogger().warn({ err: circuit.message, code: circuit.code, requestId }, "circuit tripped");
      return reply.status(circuit.httpStatus).send({
        ok: false,
        code: circuit.code,
        message: circuit.message,
        requestId,
        circuits: globalCircuits.stats(),
      });
    }
    getLogger().error({ err, requestId }, "unhandled error");
    const m = formatMessage("ERR_INTERNAL", {
      requestId,
      detail: err instanceof Error ? err.message : "unknown",
    });
    return reply.status(500).send({
      ok: false,
      code: "ERR_INTERNAL",
      message: m.message,
      requestId,
    });
  };

  app.get("/health", async () => {
    const stats = engine.stats();
    const uptimeMs = Math.round(process.uptime() * 1000);
    logMessage("OK_HEALTH", { uptimeMs, storage: storage.name });
    return apiEnvelope("OK_HEALTH", {
      status: "ok",
      storage: storage.name,
      uptimeMs,
      ...stats,
      circuits: globalCircuits.stats(),
      vendor: "VaagaTech",
      product: "Anvesh",
    }, { uptimeMs, storage: storage.name });
  });

  app.get("/ready", async (_req, reply) => {
    try {
      const ok = storage.ping ? await storage.ping() : true;
      if (!ok) return reply.status(503).send({ ok: false, status: "not_ready" });
      return { ok: true, status: "ready" };
    } catch {
      return reply.status(503).send({ ok: false, status: "not_ready" });
    }
  });

  app.get("/v1/indexes", async (req) => {
    const indexes = engine.listIndexes();
    logMessage("OK_INDEX_LISTED", { count: indexes.length }, { requestId: req.requestId });
    return apiEnvelope("OK_INDEX_LISTED", { indexes }, { count: indexes.length });
  });

  app.post("/v1/indexes", async (req, reply) => {
    try {
      const body = createIndexSchema.parse(req.body);
      const index = await engine.createIndex(body.name, body.mappings, body.settings);
      logMessage("OK_INDEX_CREATED", { name: body.name }, { requestId: req.requestId });
      return reply.status(201).send(apiEnvelope("OK_INDEX_CREATED", { index }, { name: body.name }));
    } catch (err) {
      return sendError(reply, err instanceof Error && err.name === "ZodError"
        ? new AnveshError("ERR_VALIDATION", { detail: err.message })
        : err, req.requestId);
    }
  });

  app.get("/v1/indexes/:name", async (req, reply) => {
    try {
      const { name } = req.params as { name: string };
      const index = engine.getIndex(name);
      return { ok: true, code: "OK_INDEX_LISTED", message: `Index \"${name}\" loaded.`, index };
    } catch (err) {
      return sendError(reply, err, req.requestId);
    }
  });

  app.delete("/v1/indexes/:name", async (req, reply) => {
    try {
      const { name } = req.params as { name: string };
      await engine.deleteIndex(name);
      logMessage("OK_INDEX_DELETED", { name }, { requestId: req.requestId });
      return apiEnvelope("OK_INDEX_DELETED", {}, { name });
    } catch (err) {
      return sendError(reply, err, req.requestId);
    }
  });

  app.put("/v1/indexes/:name/documents/:id", async (req, reply) => {
    try {
      const { name, id } = req.params as { name: string; id: string };
      const body = indexDocumentSchema.parse({ ...(req.body as object), id });
      const doc = await engine.indexDocument(name, {
        id,
        fields: body.fields as Record<string, JsonValue>,
        vector: body.vector,
        meta: body.meta as Record<string, JsonValue> | undefined,
      });
      logMessage("OK_DOC_INDEXED", { index: name, id }, { requestId: req.requestId });
      return reply.status(201).send(apiEnvelope("OK_DOC_INDEXED", { document: doc }, { index: name, id }));
    } catch (err) {
      return sendError(reply, err instanceof Error && err.name === "ZodError"
        ? new AnveshError("ERR_VALIDATION", { detail: err.message })
        : err, req.requestId);
    }
  });

  app.post("/v1/indexes/:name/documents", async (req, reply) => {
    try {
      const { name } = req.params as { name: string };
      const body = indexDocumentSchema.parse(req.body);
      const doc = await engine.indexDocument(name, {
        id: body.id,
        fields: body.fields as Record<string, JsonValue>,
        vector: body.vector,
        meta: body.meta as Record<string, JsonValue> | undefined,
      });
      logMessage("OK_DOC_INDEXED", { index: name, id: doc.id }, { requestId: req.requestId });
      return reply.status(201).send(
        apiEnvelope("OK_DOC_INDEXED", { document: doc }, { index: name, id: doc.id }),
      );
    } catch (err) {
      return sendError(reply, err instanceof Error && err.name === "ZodError"
        ? new AnveshError("ERR_VALIDATION", { detail: err.message })
        : err, req.requestId);
    }
  });

  app.post("/v1/indexes/:name/documents/_bulk", async (req, reply) => {
    try {
      const { name } = req.params as { name: string };
      const body = bulkIndexSchema.parse(req.body);
      globalCircuits.checkBulkSize(body.documents.length);
      globalCircuits.checkMemory();
      const index = engine.getIndex(name);
      globalCircuits.checkDocCap(index.docCount, body.documents.length);
      const result = await engine.bulkIndex(
        name,
        body.documents.map((d) => ({
          id: d.id,
          fields: d.fields as Record<string, JsonValue>,
          vector: d.vector,
          meta: d.meta as Record<string, JsonValue> | undefined,
        })),
      );
      logMessage(
        "OK_BULK",
        { index: name, indexed: result.indexed, failed: result.failed },
        { requestId: req.requestId },
      );
      return apiEnvelope(
        "OK_BULK",
        { result },
        { index: name, indexed: result.indexed, failed: result.failed },
      );
    } catch (err) {
      return sendError(reply, err instanceof Error && err.name === "ZodError"
        ? new AnveshError("ERR_VALIDATION", { detail: err.message })
        : err, req.requestId);
    }
  });

  app.get("/v1/indexes/:name/documents/:id", async (req, reply) => {
    try {
      const { name, id } = req.params as { name: string; id: string };
      const document = engine.getDocument(name, id);
      return { ok: true, message: `Document \"${id}\" retrieved.`, document };
    } catch (err) {
      return sendError(reply, err, req.requestId);
    }
  });

  app.get("/v1/indexes/:name/documents", async (req, reply) => {
    try {
      const { name } = req.params as { name: string };
      const q = req.query as { from?: string; size?: string };
      const result = engine.listDocuments(name, {
        from: q.from ? Number(q.from) : 0,
        size: q.size ? Number(q.size) : 20,
      });
      return {
        ok: true,
        message: `Listed ${result.documents.length} of ${result.total} document(s).`,
        ...result,
      };
    } catch (err) {
      return sendError(reply, err, req.requestId);
    }
  });

  app.delete("/v1/indexes/:name/documents", async (req, reply) => {
    try {
      const { name } = req.params as { name: string };
      const result = await engine.clearDocuments(name);
      logMessage("OK_DOC_DELETED", { index: name, id: "*" }, { requestId: req.requestId });
      return {
        ok: true,
        message: `Cleared ${result.deleted} document(s) from \"${name}\".`,
        ...result,
      };
    } catch (err) {
      return sendError(reply, err, req.requestId);
    }
  });

  app.delete("/v1/indexes/:name/documents/:id", async (req, reply) => {
    try {
      const { name, id } = req.params as { name: string; id: string };
      await engine.deleteDocument(name, id);
      logMessage("OK_DOC_DELETED", { index: name, id }, { requestId: req.requestId });
      return apiEnvelope("OK_DOC_DELETED", {}, { index: name, id });
    } catch (err) {
      return sendError(reply, err, req.requestId);
    }
  });

  app.post("/v1/indexes/:name/search", async (req, reply) => {
    try {
      const { name } = req.params as { name: string };
      const body = searchSchema.parse(req.body);
      const result = await globalCircuits.withSearchSlot(() => {
        globalCircuits.checkResultWindow(body.from ?? 0, body.size ?? 10);
        return engine.search(name, {
          ...body,
          maxFuzzyCandidates: globalCircuits.config.maxFuzzyCandidates,
        });
      });
      if (globalCircuits.tripped.fuzzy) {
        reply.header("x-anvesh-fuzzy-capped", "1");
      }
      logMessage(
        "OK_SEARCH",
        { index: name, total: result.total, tookMs: result.tookMs, mode: body.mode ?? "keyword" },
        { requestId: req.requestId },
      );
      return {
        ok: true,
        code: "OK_SEARCH" as const,
        ...result,
      };
    } catch (err) {
      return sendError(reply, err instanceof Error && err.name === "ZodError"
        ? new AnveshError("ERR_VALIDATION", { detail: err.message })
        : err, req.requestId);
    }
  });

  app.post("/v1/indexes/:name/suggest", async (req, reply) => {
    try {
      const { name } = req.params as { name: string };
      const body = suggestSchema.parse(req.body);
      const suggestions = engine.suggest(name, body.prefix, {
        field: body.field,
        size: body.size,
      });
      return { ok: true, suggestions };
    } catch (err) {
      return sendError(reply, err instanceof Error && err.name === "ZodError"
        ? new AnveshError("ERR_VALIDATION", { detail: err.message })
        : err, req.requestId);
    }
  });

  app.post("/v1/indexes/:name/update-by-query", async (req, reply) => {
    try {
      const { name } = req.params as { name: string };
      const body = updateByQuerySchema.parse(req.body);
      globalCircuits.checkMemory();
      const result = await engine.updateByQuery(name, {
        filters: body.filters as Parameters<typeof engine.updateByQuery>[1]["filters"],
        set: body.set as Record<string, unknown>,
        maxDocs: body.maxDocs,
      });
      return { ok: true, ...result };
    } catch (err) {
      return sendError(reply, err instanceof Error && err.name === "ZodError"
        ? new AnveshError("ERR_VALIDATION", { detail: err.message })
        : err, req.requestId);
    }
  });

  app.get("/v1/aliases", async () => {
    return { ok: true, aliases: engine.listAliases() };
  });

  app.put("/v1/aliases/:alias", async (req, reply) => {
    try {
      const { alias } = req.params as { alias: string };
      const body = (req.body ?? {}) as { index?: string };
      if (!body.index) throw new AnveshError("ERR_VALIDATION", { detail: "index is required" });
      engine.putAlias(alias, body.index);
      return { ok: true, alias, index: body.index };
    } catch (err) {
      return sendError(reply, err, req.requestId);
    }
  });

  app.delete("/v1/aliases/:alias", async (req, reply) => {
    try {
      const { alias } = req.params as { alias: string };
      engine.deleteAlias(alias);
      return { ok: true, alias };
    } catch (err) {
      return sendError(reply, err, req.requestId);
    }
  });

  app.get("/v1/stats", async (req) => {
    const stats = engine.stats();
    logMessage("OK_STATS", stats, { requestId: req.requestId });
    return apiEnvelope(
      "OK_STATS",
      { stats, circuits: globalCircuits.stats() },
      stats,
    );
  });

  // ─── Plugins (LLM-tool style catalog + invoke) ─────────────────────────────

  app.get("/v1/plugins", async () => ({
    ok: true,
    plugins: plugins.listPlugins(),
  }));

  app.get("/v1/plugins/tools", async () => ({
    ok: true,
    tools: plugins.listTools(),
  }));

  app.post("/v1/plugins/invoke", async (req, reply) => {
    try {
      const body = z
        .object({
          name: z.string().min(1),
          arguments: z.record(z.unknown()).default({}),
        })
        .parse(req.body);
      const result = await plugins.invoke(body.name, body.arguments);
      if (!result.ok) {
        return reply.status(404).send({
          ok: false,
          code: "ERR_VALIDATION",
          message: result.error ?? `Unknown tool "${body.name}".`,
          tool: body.name,
        });
      }
      return { ok: true, tool: result.tool, result: result.result };
    } catch (err) {
      return sendError(
        reply,
        err instanceof Error && err.name === "ZodError"
          ? new AnveshError("ERR_VALIDATION", { detail: err.message })
          : err,
        req.requestId,
      );
    }
  });

  return { app, engine, plugins };
}

export async function listenAnvesh(
  options: AnveshServerOptions & { host?: string; port?: number } = {},
): Promise<FastifyInstance> {
  const { app } = await createAnveshApp(options);
  const port = options.port ?? Number(process.env.PORT ?? process.env.ANVESH_PORT ?? 3848);
  const host = options.host ?? process.env.ANVESH_HOST ?? "0.0.0.0";
  await app.listen({ port, host });
  getLogger().info(
    { port, host, product: "anvesh", vendor: "vaagatech" },
    `Anvesh is listening on http://${host}:${port} — by VaagaTech`,
  );
  return app;
}
