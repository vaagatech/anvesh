/**
 * Lightweight HTTP worker mode so Hub can trigger crawls on remote instances.
 * Captures logs for Hub and pushes pages to an indexer (no file hand-off).
 * Features disk-backed job persistence and automatic replay on server restart.
 */
import { createServer } from "node:http";
import { Writable } from "node:stream";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as http from "node:http";
import * as os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import pino from "pino";
import { spiderConfigSchema, globalResourceGuard, globalDeadLetter, type CrawledPage } from "@vaagatech/anvesh-shared";
import { SiteSpider } from "./crawler.js";

type JobPayload = {
  config?: unknown;
  autoIndex?: {
    enabled?: boolean;
    index?: string;
    engineUrl?: string;
    apiKey?: string;
    indexerUrl?: string;
    indexerApiKey?: string;
  };
};

type JobRecord = {
  status: string;
  message: string;
  output?: string;
  logs: string[];
  pages?: number;
  indexName?: string;
  indexed?: number;
  payload?: JobPayload;
  createdAt?: string;
  updatedAt?: string;
};

const rootLog = pino({
  base: { service: "anvesh-spider", vendor: "vaagatech" },
  transport:
    process.env.ANVESH_LOG_PRETTY === "0"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
});

const apiKey = process.env.ANVESH_SPIDER_API_KEY;
const dataDir = process.env.ANVESH_SPIDER_DATA_DIR ?? path.resolve(process.cwd(), ".anvesh");
const jobsDbPath = path.join(dataDir, "spider_jobs.sqlite");

class SQLiteJobsMap {
  private db: import("better-sqlite3").Database;
  private stmtGet: import("better-sqlite3").Statement;
  private stmtSet: import("better-sqlite3").Statement;
  private stmtDel: import("better-sqlite3").Statement;
  private stmtList: import("better-sqlite3").Statement;

  constructor(file: string) {
    this.db = new Database(file);
    this.db.exec("CREATE TABLE IF NOT EXISTS spider_jobs (id TEXT PRIMARY KEY, data TEXT)");
    this.stmtGet = this.db.prepare("SELECT data FROM spider_jobs WHERE id = ?");
    this.stmtSet = this.db.prepare("INSERT OR REPLACE INTO spider_jobs (id, data) VALUES (?, ?)");
    this.stmtDel = this.db.prepare("DELETE FROM spider_jobs WHERE id = ?");
    this.stmtList = this.db.prepare("SELECT id, data FROM spider_jobs");
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
    const row = this.db.prepare("SELECT COUNT(*) as count FROM spider_jobs").get() as { count: number };
    return row.count;
  }
  close() {
    this.db.close();
  }
}

async function saveJobsToDisk(jobs: SQLiteJobsMap): Promise<void> {
  // SQLite handles disk writes implicitly. No-op to satisfy existing callers.
}

async function loadJobsFromDisk(): Promise<SQLiteJobsMap> {
  await mkdir(dataDir, { recursive: true });
  return new SQLiteJobsMap(jobsDbPath);
}

function unauthorized(res: import("node:http").ServerResponse) {
  res.writeHead(401, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false, message: "Authentication failed for spider worker." }));
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

function pushLog(job: JobRecord, line: string, onUpdate?: () => void) {
  job.logs.push(line);
  if (job.logs.length > 500) job.logs.splice(0, job.logs.length - 500);
  onUpdate?.();
}

function jobLogger(job: JobRecord, onUpdate?: () => void): pino.Logger {
  const capture = new Writable({
    write(chunk, _enc, cb) {
      try {
        const raw = String(chunk);
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line) as { msg?: string; level?: number; [k: string]: unknown };
            const msg = obj.msg ?? line;
            const extras = { ...obj };
            delete extras.msg;
            delete extras.level;
            delete extras.time;
            delete extras.pid;
            delete extras.hostname;
            delete extras.service;
            delete extras.vendor;
            const extraKeys = Object.keys(extras);
            pushLog(
              job,
              extraKeys.length
                ? `${msg} ${JSON.stringify(extras)}`
                : String(msg),
              onUpdate,
            );
          } catch {
            pushLog(job, line, onUpdate);
          }
        }
      } catch {
        /* ignore */
      }
      cb();
    },
  });
  return pino({ base: { service: "anvesh-spider", vendor: "vaagatech" } }, capture);
}

async function pollIndexer(
  indexerUrl: string,
  jobId: string,
  apiKeyHeader: string | undefined,
  spiderJob: JobRecord,
  onUpdate?: () => void,
): Promise<{ status: string; message: string; indexed?: number }> {
  for (let i = 0; i < 180; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const poll = await fetch(`${indexerUrl}/v1/jobs/${encodeURIComponent(jobId)}`, {
      headers: apiKeyHeader ? { authorization: `Bearer ${apiKeyHeader}` } : {},
    });
    const st = (await poll.json().catch(() => ({}))) as Record<string, unknown>;
    if (Array.isArray(st.logs)) {
      for (const line of st.logs as string[]) {
        const tagged = `indexer| ${line}`;
        if (!spiderJob.logs.includes(tagged)) pushLog(spiderJob, tagged, onUpdate);
      }
    }
    if (st.status === "completed" || st.status === "failed") {
      return {
        status: String(st.status),
        message: String(st.message ?? ""),
        indexed: typeof st.indexed === "number" ? st.indexed : undefined,
      };
    }
  }
  return { status: "failed", message: "Timed out waiting for indexer." };
}

async function executeCrawlJob(
  id: string,
  job: JobRecord,
  jobs: SQLiteJobsMap,
) {
  const save = () => { jobs.set(id, job); };
  try {
    const payload = job.payload ?? {};
    const config = spiderConfigSchema.parse(payload.config ?? payload);
    job.status = "running";
    job.updatedAt = new Date().toISOString();
    pushLog(job, `Executing crawl job. seeds=${JSON.stringify(config.seeds)} maxPages=${config.maxPages} concurrency=${config.concurrency}`, save);

    const auto = payload.autoIndex;
    const shouldIndex =
      auto?.enabled !== false &&
      Boolean(auto?.indexerUrl && auto?.engineUrl && (auto.index || config.indexName));
    const indexName = auto?.index || config.indexName || "web";

    let totalPagesCrawled = 0;
    let totalPagesIndexed = 0;
    const chunkSize = Number(process.env.ANVESH_SPIDER_CHUNK_SIZE ?? 50);
    const maxRetries = Number(process.env.ANVESH_SPIDER_MAX_RETRIES ?? 5);

    const onChunk = shouldIndex
      ? async (chunk: CrawledPage[]) => {
          if (chunk.length === 0) return;
          totalPagesCrawled += chunk.length;
          pushLog(
            job,
            `Indexing chunk of ${chunk.length} page(s) into "${indexName}" (pages → indexer → engine).`,
            save,
          );

          let idxRes: Response | undefined;
          for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
              idxRes = await fetch(`${auto!.indexerUrl!.replace(/\/$/, "")}/v1/jobs`, {
                method: "POST",
                headers: {
                  "content-type": "application/x-ndjson",
                  "x-anvesh-index": indexName,
                  "x-anvesh-engine-url": auto!.engineUrl || "",
                  "x-anvesh-engine-key": auto!.apiKey || "",
                  ...(auto!.indexerApiKey
                    ? { authorization: `Bearer ${auto!.indexerApiKey}` }
                    : {}),
                },
                body: chunk.map((p) => JSON.stringify(p)).join("\n"),
              });
              if (idxRes.ok || idxRes.status < 500) break;
            } catch (e) {
              if (attempt === 4) throw e;
            }
            await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
          }

          if (!idxRes) throw new Error("Failed to connect to indexer after 5 attempts.");
          const idxJson = (await idxRes.json().catch(() => ({}))) as Record<string, unknown>;
          if (!idxRes.ok) {
            throw new Error(
              `Indexer rejected chunk: ${idxJson.message ?? `HTTP ${idxRes.status}`}`,
            );
          }
          const remoteId = String(idxJson.jobId ?? "");
          if (remoteId) {
            const result = await pollIndexer(
              auto!.indexerUrl!.replace(/\/$/, ""),
              remoteId,
              auto!.indexerApiKey,
              job,
              save,
            );
            if (result.status === "failed") {
              throw new Error(`Chunk indexing failed: ${result.message}`);
            }
            totalPagesIndexed += result.indexed ?? chunk.length;
          } else {
            totalPagesIndexed += chunk.length;
          }
        }
      : undefined;

    const spider = new SiteSpider(config, jobLogger(job, save));
    const pages = await spider.crawl(onChunk, chunkSize);

    const finalCount = shouldIndex ? totalPagesCrawled : pages.length;
    job.pages = finalCount;

    if (shouldIndex && finalCount > 0) {
      job.indexed = totalPagesIndexed;
      job.status = "completed";
      job.message = `Crawl finished (${finalCount} pages) and indexed into "${indexName}".`;
      pushLog(job, `Indexed ${totalPagesIndexed} page(s) total into "${indexName}".`, save);
    } else if (finalCount === 0) {
      job.status = "completed";
      job.message = "Crawl finished with 0 pages.";
    } else {
      job.status = "failed";
      job.message =
        "Crawl finished but indexing was not configured (need index + indexer + engine).";
      pushLog(job, job.message, save);
    }
  } catch (err) {
    job.status = "failed";
    job.message = err instanceof Error ? err.message : String(err);
    pushLog(job, `FAILED: ${job.message}`, save);
    rootLog.error({ id, err }, "crawl job failed");
  } finally {
    job.updatedAt = new Date().toISOString();
    save();
  }
}

export function startSpiderServer(port = Number(process.env.ANVESH_SPIDER_PORT ?? 3851)): void {
  void (async () => {
    const jobs = await loadJobsFromDisk();

    // Auto-replay / resume any interrupted jobs from previous run
    for (const [id, job] of jobs.entries()) {
      if (job.status === "running" || job.status === "queued") {
        rootLog.info({ id }, `Auto-replaying/resuming interrupted crawl job "${id}".`);
        pushLog(job, "[Worker Restart] Auto-replaying/resuming crawl job...");
        void executeCrawlJob(id, job, jobs);
      }
    }

    const server = createServer(async (req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      if (apiKey) {
        const auth = req.headers.authorization || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : String(req.headers["x-api-key"] || "");
        if (token !== apiKey && url.pathname !== "/health") {
          unauthorized(res);
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
            product: "Anvesh Spider",
            message: "Spider worker is healthy and accepting crawl jobs.",
            activeJobs: Array.from(jobs.values()).filter(j => j.status === "running" || j.status === "queued").length,
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
        const activeJobs = Array.from(jobs.values()).filter(j => j.status === "running" || j.status === "queued").length;

        let output = "";
        output += `# HELP anvesh_spider_uptime_seconds Spider process uptime in seconds\n`;
        output += `# TYPE anvesh_spider_uptime_seconds gauge\n`;
        output += `anvesh_spider_uptime_seconds ${uptimeSec}\n\n`;

        output += `# HELP anvesh_spider_memory_heap_ratio Spider heap utilization ratio (target <= 0.75)\n`;
        output += `# TYPE anvesh_spider_memory_heap_ratio gauge\n`;
        output += `anvesh_spider_memory_heap_ratio ${resStats.heapRatio}\n\n`;

        output += `# HELP anvesh_spider_memory_rss_bytes Spider resident set size in bytes\n`;
        output += `# TYPE anvesh_spider_memory_rss_bytes gauge\n`;
        output += `anvesh_spider_memory_rss_bytes ${mem.rss}\n\n`;

        output += `# HELP anvesh_spider_active_jobs Number of active crawl jobs\n`;
        output += `# TYPE anvesh_spider_active_jobs gauge\n`;
        output += `anvesh_spider_active_jobs ${activeJobs}\n\n`;

        output += `# HELP anvesh_spider_dead_letter_total Failed crawl URLs recorded in dead-letter\n`;
        output += `# TYPE anvesh_spider_dead_letter_total counter\n`;
        output += `anvesh_spider_dead_letter_total ${dlStats.totalRecorded}\n\n`;

        res.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
        res.end(output);
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/dead-letter") {
        const recent = await globalDeadLetter.getRecent({ source: "spider" });
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
          const body = (await readJson(req)) as JobPayload;
          const config = spiderConfigSchema.parse(body.config ?? body);
          const id = `job_${Date.now()}`;
          const job: JobRecord = {
            status: "running",
            message: "Crawl started.",
            logs: [],
            indexName: body.autoIndex?.index ?? config.indexName,
            payload: body,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          jobs.set(id, job);
          pushLog(
            job,
            `Crawl job accepted. seeds=${JSON.stringify(config.seeds)} maxPages=${config.maxPages}`,
          );
          await saveJobsToDisk(jobs);

          res.writeHead(202, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              ok: true,
              jobId: id,
              message: "Crawl job accepted. Poll /v1/jobs/:id for status and logs.",
            }),
          );

          void executeCrawlJob(id, job, jobs);
        } catch (err) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              ok: false,
              message: err instanceof Error ? err.message : "Invalid crawl job.",
            }),
          );
        }
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, message: "Not found." }));
    });

    server.listen(port, "0.0.0.0", () => {
      rootLog.info({ port }, `Anvesh Spider worker listening on :${port}`);
    });

    const gracefulShutdown = async () => {
      rootLog.info("Shutting down Spider server gracefully...");
      jobs.close();
      server.close(() => {
        process.exit(0);
      });
    };
    process.on("SIGINT", gracefulShutdown);
    process.on("SIGTERM", gracefulShutdown);

    process.on("uncaughtException", (err) => {
      rootLog.error({ err }, "Spider uncaughtException");
      process.exit(1);
    });
    process.on("unhandledRejection", (err) => {
      rootLog.error({ err }, "Spider unhandledRejection");
      process.exit(1);
    });
  })();
}
