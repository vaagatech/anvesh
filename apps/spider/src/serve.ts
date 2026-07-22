/**
 * Lightweight HTTP worker mode so Hub can trigger crawls on remote instances.
 * Captures logs for Hub and pushes pages to an indexer (no file hand-off).
 */
import { createServer } from "node:http";
import { Writable } from "node:stream";
import pino from "pino";
import { spiderConfigSchema } from "@vaagatech/anvesh-shared";
import { SiteSpider } from "./crawler.js";

type JobRecord = {
  status: string;
  message: string;
  output?: string;
  logs: string[];
  pages?: number;
  indexName?: string;
  indexed?: number;
};

const rootLog = pino({
  base: { service: "anvesh-spider", vendor: "vaagatech" },
  transport:
    process.env.ANVESH_LOG_PRETTY === "0"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
});

const apiKey = process.env.ANVESH_SPIDER_API_KEY;

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

function pushLog(job: JobRecord, line: string) {
  job.logs.push(line);
  if (job.logs.length > 500) job.logs.splice(0, job.logs.length - 500);
}

function jobLogger(job: JobRecord): pino.Logger {
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
            );
          } catch {
            pushLog(job, line);
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
        if (!spiderJob.logs.includes(tagged)) pushLog(spiderJob, tagged);
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

export function startSpiderServer(port = Number(process.env.ANVESH_SPIDER_PORT ?? 3851)): void {
  const jobs = new Map<string, JobRecord>();

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
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          product: "Anvesh Spider",
          message: "Spider worker is healthy and accepting crawl jobs.",
        }),
      );
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
        const body = (await readJson(req)) as {
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
        const config = spiderConfigSchema.parse(body.config ?? body);
        const id = `job_${Date.now()}`;
        const job: JobRecord = {
          status: "running",
          message: "Crawl started.",
          logs: [],
          indexName: body.autoIndex?.index ?? config.indexName,
        };
        jobs.set(id, job);
        pushLog(
          job,
          `Crawl job accepted. seeds=${JSON.stringify(config.seeds)} maxPages=${config.maxPages}`,
        );

        res.writeHead(202, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            jobId: id,
            message: "Crawl job accepted. Poll /v1/jobs/:id for status and logs.",
          }),
        );

        void (async () => {
          try {
            const spider = new SiteSpider(config, jobLogger(job));
            const pages = await spider.crawl();
            job.pages = pages.length;
            pushLog(job, `Crawl finished with ${pages.length} page(s).`);

            const auto = body.autoIndex;
            const shouldIndex =
              auto?.enabled !== false &&
              Boolean(auto?.indexerUrl && auto?.engineUrl && (auto.index || config.indexName));

            if (shouldIndex && pages.length > 0) {
              const indexName = auto!.index || config.indexName || "web";
              pushLog(
                job,
                `Indexing ${pages.length} page(s) into "${indexName}" (pages → indexer → engine).`,
              );
              const idxRes = await fetch(`${auto!.indexerUrl!.replace(/\/$/, "")}/v1/jobs`, {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  ...(auto!.indexerApiKey
                    ? { authorization: `Bearer ${auto!.indexerApiKey}` }
                    : {}),
                },
                body: JSON.stringify({
                  index: indexName,
                  pages,
                  engineUrl: auto!.engineUrl,
                  apiKey: auto!.apiKey,
                  createIndex: true,
                }),
              });
              const idxJson = (await idxRes.json().catch(() => ({}))) as Record<string, unknown>;
              if (!idxRes.ok) {
                throw new Error(
                  `Indexer rejected pages: ${idxJson.message ?? `HTTP ${idxRes.status}`}`,
                );
              }
              const remoteId = String(idxJson.jobId ?? "");
              if (remoteId) {
                const result = await pollIndexer(
                  auto!.indexerUrl!.replace(/\/$/, ""),
                  remoteId,
                  auto!.indexerApiKey,
                  job,
                );
                job.indexed = result.indexed ?? pages.length;
                if (result.status === "failed") {
                  throw new Error(result.message || "Indexer job failed.");
                }
                pushLog(job, `Indexed ≈${job.indexed} page(s) into "${indexName}".`);
              } else {
                job.indexed = pages.length;
                pushLog(job, "Indexer accepted pages (no job id returned).");
              }
              job.status = "completed";
              job.message = `Crawl finished (${pages.length} pages) and indexed into "${indexName}".`;
            } else if (pages.length === 0) {
              job.status = "completed";
              job.message = "Crawl finished with 0 pages.";
            } else {
              job.status = "failed";
              job.message =
                "Crawl finished but indexing was not configured (need index + indexer + engine).";
              pushLog(job, job.message);
            }
          } catch (err) {
            job.status = "failed";
            job.message = err instanceof Error ? err.message : String(err);
            pushLog(job, `FAILED: ${job.message}`);
            rootLog.error({ err }, "crawl job failed");
          }
        })();
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
}
