/**
 * Lightweight HTTP worker so Hub / Spider can push index jobs.
 * Accepts: file path (input), crawled pages[], or documents[].
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import {
  crawledPageToDocument,
  enrichIndexDocument,
  INDEXER_DEFAULT_BATCH,
  WEB_MAPPINGS,
  WEB_SETTINGS,
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
  if (job.logs.length > 400) job.logs.splice(0, job.logs.length - 400);
  log.info(line);
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
  pushLog(job, `Created index "${index}" (dynamic schema, vectorDimensions=256).`);
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
  for (let i = 0; i < documents.length; i += batchSize) {
    const slice = documents.slice(i, i + batchSize);
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
      pushLog(job, `Bulk batch failed: ${json.message ?? res.status}`);
    } else {
      indexed += json.result?.indexed ?? slice.length;
      failed += json.result?.failed ?? 0;
      pushLog(job, `Bulk progress: ${indexed}/${documents.length}`);
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
  const jobs = new Map<string, JobRecord>();

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
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          product: "Anvesh Indexer",
          message: "Indexer worker is healthy and accepting jobs (files, pages, or documents).",
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
          index?: string;
          input?: string;
          pages?: CrawledPage[];
          documents?: IndexDocumentPayload[];
          engineUrl?: string;
          apiKey?: string;
          batchSize?: number;
          createIndex?: boolean;
        };
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
              message: "Provide pages[], documents[], or input (file path).",
            }),
          );
          return;
        }

        const id = `job_${Date.now()}`;
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

        void (async () => {
          try {
            if (docs.length) {
              if (!body.engineUrl) {
                throw new Error("engineUrl is required when indexing pages/documents over HTTP.");
              }
              const engineUrl = body.engineUrl.replace(/\/$/, "");
              pushLog(job, `Indexing ${docs.length} document(s) into "${body.index}" via ${engineUrl}`);
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
              pushLog(job, job.message);
              return;
            }

            // Legacy file path via CLI
            pushLog(job, `Indexing from file ${body.input} into "${body.index}"`);
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
            child.stdout?.on("data", (d) => pushLog(job, String(d).trim()));
            child.stderr.on("data", (d) => {
              errBuf += String(d);
              pushLog(job, String(d).trim());
            });
            child.on("exit", (code) => {
              if (code === 0) {
                job.status = "completed";
                job.message = "Indexing finished successfully.";
              } else {
                job.status = "failed";
                job.message = errBuf.trim() || `Indexer exited with code ${code}`;
              }
              pushLog(job, job.message);
            });
          } catch (err) {
            job.status = "failed";
            job.message = err instanceof Error ? err.message : String(err);
            pushLog(job, `FAILED: ${job.message}`);
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
}
