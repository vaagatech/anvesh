/**
 * Lightweight HTTP worker mode so Hub can trigger crawls on remote instances.
 */
import { createServer } from "node:http";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import { spiderConfigSchema } from "@vaagatech/anvesh-shared";
import { SiteSpider } from "./crawler.js";

const log = pino({
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

export function startSpiderServer(port = Number(process.env.ANVESH_SPIDER_PORT ?? 3851)): void {
  const jobs = new Map<string, { status: string; message: string; output?: string }>();

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
        const body = (await readJson(req)) as { config?: unknown };
        const config = spiderConfigSchema.parse(body.config ?? body);
        const id = `job_${Date.now()}`;
        jobs.set(id, { status: "running", message: "Crawl started." });
        res.writeHead(202, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            jobId: id,
            message: "Crawl job accepted. Poll /v1/jobs/:id for status.",
          }),
        );

        void (async () => {
          try {
            const spider = new SiteSpider(config, log);
            const pages = await spider.crawl();
            const outPath = path.resolve(config.outputPath ?? `.anvesh/crawl/${id}.jsonl`);
            await mkdir(path.dirname(outPath), { recursive: true });
            await writeFile(outPath, pages.map((p) => JSON.stringify(p)).join("\n") + "\n", "utf8");
            jobs.set(id, {
              status: "completed",
              message: `Crawl finished with ${pages.length} page(s).`,
              output: outPath,
            });
          } catch (err) {
            jobs.set(id, {
              status: "failed",
              message: err instanceof Error ? err.message : String(err),
            });
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
    log.info({ port }, `Anvesh Spider worker listening on :${port}`);
  });
}
