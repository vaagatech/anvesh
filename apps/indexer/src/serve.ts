/**
 * Lightweight HTTP worker so Hub can trigger bulk index jobs remotely.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";

const log = pino({
  base: { service: "anvesh-indexer", vendor: "vaagatech" },
  transport:
    process.env.ANVESH_LOG_PRETTY === "0"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
});

const apiKey = process.env.ANVESH_INDEXER_API_KEY;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export function startIndexerServer(port = Number(process.env.ANVESH_INDEXER_PORT ?? 3852)): void {
  const jobs = new Map<string, { status: string; message: string }>();

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
          message: "Indexer worker is healthy and accepting jobs.",
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
          engineUrl?: string;
          apiKey?: string;
          batchSize?: number;
        };
        if (!body.index || !body.input) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, message: "index and input are required." }));
          return;
        }
        const id = `job_${Date.now()}`;
        jobs.set(id, { status: "running", message: "Indexing started." });
        res.writeHead(202, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            jobId: id,
            message: "Index job accepted. Poll /v1/jobs/:id for status.",
          }),
        );

        const cli = path.resolve(__dirname, "cli.js");
        const args = ["--index", body.index, "--input", body.input];
        if (body.engineUrl) {
          args.push("--engine-url", body.engineUrl);
        }
        if (body.apiKey) args.push("--api-key", body.apiKey);
        if (body.batchSize) args.push("--batch-size", String(body.batchSize));

        const child = spawn(process.execPath, [cli, ...args], {
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let errBuf = "";
        child.stderr.on("data", (d) => {
          errBuf += String(d);
        });
        child.on("exit", (code) => {
          if (code === 0) {
            jobs.set(id, { status: "completed", message: "Indexing finished successfully." });
          } else {
            jobs.set(id, {
              status: "failed",
              message: errBuf.trim() || `Indexer exited with code ${code}`,
            });
          }
        });
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
