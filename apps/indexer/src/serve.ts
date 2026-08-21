import { globalResourceGuard } from "@vaagatech/anvesh-shared";
/**
 * Lightweight HTTP worker so Hub / Spider can push index jobs.
 * Accepts: file path (input), crawled pages[], or documents[].
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import * as http from "node:http";
import * as os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import pino from "pino";
import {
  crawledPageToDocument,
  enrichIndexDocument,
  INDEXER_DEFAULT_BATCH,
  WEB_MAPPINGS,
  WEB_SETTINGS,
  globalDeadLetter,
  discoverVisionService,
  embedImageWithDiscovery,
  type CrawledPage,
  type IndexDocumentPayload,
} from "@vaagatech/anvesh-shared";

const log = pino({
  base: { service: "anvesh-indexer", vendor: "vaagatech" },
  transport:
    process.env.ANVESH_LOG_PRETTY === "0"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
});

const apiKey = process.env.ANVESH_INDEXER_API_KEY;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

type JobRecord = {
  status: string;
  message: string;
  logs: string[];
  indexed?: number;
  failed?: number;
};

const dataDir = process.env.ANVESH_INDEXER_DATA_DIR ?? path.resolve(process.cwd(), ".anvesh");
const jobsDbPath = path.join(dataDir, "indexer_jobs.sqlite");

class SQLiteJobsMap {
  private db: import("better-sqlite3").Database;
  private stmtGet: import("better-sqlite3").Statement;
  private stmtSet: import("better-sqlite3").Statement;
  private stmtDel: import("better-sqlite3").Statement;
  private stmtList: import("better-sqlite3").Statement;

  constructor(file: string) {
    mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.exec("CREATE TABLE IF NOT EXISTS indexer_jobs (id TEXT PRIMARY KEY, data TEXT)");
    this.stmtGet = this.db.prepare("SELECT data FROM indexer_jobs WHERE id = ?");
    this.stmtSet = this.db.prepare("INSERT OR REPLACE INTO indexer_jobs (id, data) VALUES (?, ?)");
    this.stmtDel = this.db.prepare("DELETE FROM indexer_jobs WHERE id = ?");
    this.stmtList = this.db.prepare("SELECT id, data FROM indexer_jobs");
  }

  get(id: string): JobRecord | undefined {
    const row = this.stmtGet.get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
  set(id: string, job: JobRecord) {
    this.stmtSet.run(id, JSON.stringify(job));
    return this;
  }
  delete(id: string) {
    this.stmtDel.run(id);
    return true;
  }
  entries(): [string, JobRecord][] {
    const rows = this.stmtList.all() as { id: string; data: string }[];
    return rows.map((r) => [r.id, JSON.parse(r.data)]);
  }
  values(): JobRecord[] {
    const rows = this.stmtList.all() as { id: string; data: string }[];
    return rows.map((r) => JSON.parse(r.data));
  }
  get size(): number {
    const row = this.db.prepare("SELECT COUNT(*) as count FROM indexer_jobs").get() as { count: number };
    return row.count;
  }
  close() {
    this.db.close();
  }
}

function readJson(req: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function pushLog(job: JobRecord, line: string, save?: () => void) {
  job.logs.push(line);
  if (job.logs.length > 400) job.logs.splice(0, job.logs.length - 400);
  log.info(line);
  if (save) save();
}

async function ensureIndex(
  engineUrl: string,
  index: string,
  apiKeyHeader: string | undefined,
  job: JobRecord,
): Promise<void> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKeyHeader) headers.authorization = `Bearer ${apiKeyHeader}`;
  const get = await fetch(`${engineUrl}/v1/indexes/${encodeURIComponent(index)}`, { headers });
  if (get.ok) {
    pushLog(job, `Index "${index}" already exists.`);
    return;
  }
  const create = await fetch(`${engineUrl}/v1/indexes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: index, mappings: WEB_MAPPINGS, settings: WEB_SETTINGS }),
  });
  if (!create.ok && create.status !== 409) {
    const j = (await create.json().catch(() => ({}))) as { message?: string };
    throw new Error(j.message || `Could not create index "${index}" (HTTP ${create.status}).`);
  }
  pushLog(job, `Created index "${index}" (dynamic schema, vectorDimensions=384).`);
}

async function bulkToEngine(
  engineUrl: string,
  index: string,
  documents: IndexDocumentPayload[],
  apiKeyHeader: string | undefined,
  batchSize: number,
  job: JobRecord,
): Promise<{ indexed: number; failed: number }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKeyHeader) headers.authorization = `Bearer ${apiKeyHeader}`;
  let indexed = 0;
  let failed = 0;

  // Dynamic Service Discovery for Multi-Modal Vision Microservice
  const visionCap = await discoverVisionService();
  if (visionCap?.available) {
    pushLog(job, `Vision microservice detected (${visionCap.modelKind}, ${visionCap.dimensions} dims) — generating multi-modal image embeddings.`);
    for (const doc of documents) {
      const imgUrl = (doc.fields?.image || doc.fields?.imageUrl || doc.fields?.listingUrl || doc.fields?.thumbnailUrl) as string | undefined;
      if (imgUrl && typeof imgUrl === "string" && !doc.fields?.image_vector) {
        try {
          const vec = await embedImageWithDiscovery(imgUrl, visionCap);
          if (vec) {
            doc.fields.image_vector = vec;
            if (!doc.vector) doc.vector = vec;
          }
        } catch (_) {}
      }
    }
  }

  const sampleBytes = documents.length ? JSON.stringify(documents[0]).length : 2048;
  const adaptiveBatch = globalResourceGuard.calculateAdaptiveChunkSize(documents.length, sampleBytes, batchSize);

  for (let i = 0; i < documents.length; i += adaptiveBatch) {
    await globalResourceGuard.throttleIfNeeded("indexer.bulkToEngine");
    const slice = documents.slice(i, i + adaptiveBatch);
    try {
      const res = await fetch(
        `${engineUrl}/v1/indexes/${encodeURIComponent(index)}/documents/_bulk`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ documents: slice }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        result?: { indexed?: number; failed?: number };
        message?: string;
      };
      if (!res.ok) {
        failed += slice.length;
        pushLog(job, `Bulk batch failed: ${json.message ?? res.status} — recording to dead-letter`);
        for (const item of slice) {
          globalDeadLetter.record({
            source: "indexer",
            targetIndex: index,
            error: json.message ?? `HTTP ${res.status}`,
            payload: item,
          });
        }
      } else {
        indexed += json.result?.indexed ?? slice.length;
        failed += json.result?.failed ?? 0;
        pushLog(job, `Bulk progress: ${indexed}/${documents.length}`);
      }
    } catch (err) {
      failed += slice.length;
      const errMsg = err instanceof Error ? err.message : String(err);
      pushLog(job, `Bulk network error: ${errMsg}`);
      for (const item of slice) {
        globalDeadLetter.record({
          source: "indexer",
          targetIndex: index,
          error: errMsg,
          payload: item,
        });
      }
    }
  }
  return { indexed, failed };
}

function toDocuments(body: {
  pages?: CrawledPage[];
  documents?: IndexDocumentPayload[];
}): IndexDocumentPayload[] {
  let docs: IndexDocumentPayload[] = [];
  if (Array.isArray(body.documents) && body.documents.length) docs = body.documents;
  else if (Array.isArray(body.pages) && body.pages.length) {
    docs = body.pages.map((p) => crawledPageToDocument(p));
  }
  return docs.map(enrichIndexDocument);
}

export function startIndexerServer(port = Number(process.env.ANVESH_INDEXER_PORT ?? 3852)): void {
  const jobs = new SQLiteJobsMap(jobsDbPath);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (apiKey) {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : String(req.headers["x-api-key"] || "");
      if (token !== apiKey && url.pathname !== "/health") {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, message: "Authentication failed for indexer worker." }));
        return;
      }
    }

    if (req.method === "GET" && url.pathname === "/health") {
      const resStats = globalResourceGuard.stats();
      const dlStats = globalDeadLetter.stats();
      
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const cpuCores = os.cpus().length;
      const cpuLoad = os.loadavg()[0] || 0;
      const systemStats = {
        memory: { total: totalMem, free: freeMem, usagePercent: Math.round((usedMem / totalMem) * 100) },
        cpu: { load: cpuLoad, cores: cpuCores, usagePercent: Math.min(100, Math.round((cpuLoad / cpuCores) * 100)) }
      };

      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          product: "Anvesh Indexer",
          message: "Indexer worker is healthy and accepting jobs (files, pages, or documents).",
          totalJobs: jobs.size,
          resourceGuard: resStats,
          deadLetter: dlStats,
          systemStats,
        }),
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/metrics") {
      const uptimeSec = Math.round(process.uptime() * 100) / 100;
      const resStats = globalResourceGuard.stats();
      const dlStats = globalDeadLetter.stats();
      const mem = process.memoryUsage();

      let output = "";
      output += `# HELP anvesh_indexer_uptime_seconds Indexer process uptime in seconds\n`;
      output += `# TYPE anvesh_indexer_uptime_seconds gauge\n`;
      output += `anvesh_indexer_uptime_seconds ${uptimeSec}\n\n`;

      output += `# HELP anvesh_indexer_memory_heap_ratio Indexer heap utilization ratio (target <= 0.75)\n`;
      output += `# TYPE anvesh_indexer_memory_heap_ratio gauge\n`;
      output += `anvesh_indexer_memory_heap_ratio ${resStats.heapRatio}\n\n`;

      output += `# HELP anvesh_indexer_memory_rss_bytes Indexer resident set size in bytes\n`;
      output += `# TYPE anvesh_indexer_memory_rss_bytes gauge\n`;
      output += `anvesh_indexer_memory_rss_bytes ${mem.rss}\n\n`;

      output += `# HELP anvesh_indexer_dead_letter_total Failed indexer records in dead-letter\n`;
      output += `# TYPE anvesh_indexer_dead_letter_total counter\n`;
      output += `anvesh_indexer_dead_letter_total ${dlStats.totalRecorded}\n\n`;

      output += `# HELP anvesh_indexer_jobs_total Total indexer jobs\n`;
      output += `# TYPE anvesh_indexer_jobs_total gauge\n`;
      output += `anvesh_indexer_jobs_total ${jobs.size}\n\n`;

      res.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
      res.end(output);
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/dead-letter") {
      const recent = await globalDeadLetter.getRecent({ source: "indexer" });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, total: recent.total, count: recent.entries.length, entries: recent.entries }));
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/v1/jobs/")) {
      const id = url.pathname.split("/").pop()!;
      const job = jobs.get(id);
      res.writeHead(job ? 200 : 404, { "content-type": "application/json" });
      res.end(JSON.stringify(job ?? { ok: false, message: "Job not found." }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/jobs") {
      try {
        const id = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;
        let body: {
          index?: string;
          input?: string;
          pages?: CrawledPage[];
          documents?: IndexDocumentPayload[];
          engineUrl?: string;
          apiKey?: string;
          batchSize?: number;
          createIndex?: boolean;
        };

        if (req.headers["content-type"]?.includes("ndjson")) {
          const tmpPath = path.join(os.tmpdir(), `${id}.ndjson`);
          await pipeline(req, createWriteStream(tmpPath));
          body = {
            input: tmpPath,
            index: Array.isArray(req.headers["x-anvesh-index"]) ? req.headers["x-anvesh-index"][0] : req.headers["x-anvesh-index"] as string,
            engineUrl: Array.isArray(req.headers["x-anvesh-engine-url"]) ? req.headers["x-anvesh-engine-url"][0] : req.headers["x-anvesh-engine-url"] as string,
            apiKey: Array.isArray(req.headers["x-anvesh-engine-key"]) ? req.headers["x-anvesh-engine-key"][0] : req.headers["x-anvesh-engine-key"] as string,
          };
        } else {
          body = (await readJson(req)) as typeof body;
        }

        if (!body.index) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, message: "index is required." }));
          return;
        }

        const docs = toDocuments(body);
        const hasFile = Boolean(body.input);
        if (!docs.length && !hasFile) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              ok: false,
              message: "Provide pages[], documents[], or input (file path) or ndjson stream.",
            }),
          );
          return;
        }

        const job: JobRecord = {
          status: "running",
          message: "Indexing started.",
          logs: [],
        };
        jobs.set(id, job);
        res.writeHead(202, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            jobId: id,
            message: "Index job accepted. Poll /v1/jobs/:id for status and logs.",
          }),
        );

        const saveJob = () => jobs.set(id, job);
        void (async () => {
          try {
            if (docs.length) {
              if (!body.engineUrl) {
                throw new Error("engineUrl is required when indexing pages/documents over HTTP.");
              }
              const engineUrl = body.engineUrl.replace(/\/$/, "");
              pushLog(job, `Indexing ${docs.length} document(s) into "${body.index}" via ${engineUrl}`, saveJob);
              if (body.createIndex !== false) {
                await ensureIndex(engineUrl, body.index!, body.apiKey, job);
              }
              const result = await bulkToEngine(
                engineUrl,
                body.index!,
                docs,
                body.apiKey,
                body.batchSize ?? INDEXER_DEFAULT_BATCH,
                job,
              );
              job.indexed = result.indexed;
              job.failed = result.failed;
              job.status = result.failed && !result.indexed ? "failed" : "completed";
              job.message = `Indexed ${result.indexed} document(s) into "${body.index}" (${result.failed} failed).`;
              pushLog(job, job.message, saveJob);
              return;
            }

            // Legacy file path via CLI
            pushLog(job, `Indexing from file ${body.input} into "${body.index}"`, saveJob);
            const cli = path.resolve(__dirname, "cli.js");
            const args = ["--index", body.index!, "--input", body.input!];
            if (body.engineUrl) args.push("--engine-url", body.engineUrl);
            if (body.apiKey) args.push("--api-key", body.apiKey);
            if (body.batchSize) args.push("--batch-size", String(body.batchSize));

            const child = spawn(process.execPath, [cli, ...args], {
              env: process.env,
              stdio: ["ignore", "pipe", "pipe"],
            });
            let errBuf = "";
            child.stdout?.on("data", (d) => pushLog(job, String(d).trim(), saveJob));
            child.stderr.on("data", (d) => {
              errBuf += String(d);
              pushLog(job, String(d).trim(), saveJob);
            });
            child.on("exit", (code) => {
              if (code === 0) {
                job.status = "completed";
                job.message = "Indexing finished successfully.";
              } else {
                job.status = "failed";
                job.message = errBuf.trim() || `Indexer exited with code ${code}`;
              }
              pushLog(job, job.message, saveJob);
            });
          } catch (err) {
            job.status = "failed";
            job.message = err instanceof Error ? err.message : String(err);
            pushLog(job, `FAILED: ${job.message}`, saveJob);
          }
        })();
      } catch (err) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            ok: false,
            message: err instanceof Error ? err.message : "Invalid index job.",
          }),
        );
      }
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, message: "Not found." }));
  });

  server.listen(port, "0.0.0.0", () => {
    log.info({ port }, `Anvesh Indexer worker listening on :${port}`);
  });

  const gracefulShutdown = async () => {
    log.info("Shutting down Indexer server gracefully...");
    jobs.close();
    server.close(() => {
      process.exit(0);
    });
  };
  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);

  process.on("uncaughtException", (err) => {
    log.error({ err }, "Indexer uncaughtException");
    process.exit(1);
  });
  process.on("unhandledRejection", (err) => {
    log.error({ err }, "Indexer unhandledRejection");
    process.exit(1);
  });
}
