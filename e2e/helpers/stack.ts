/**
 * Isolated Anvesh stack for e2e — own ports + data dir so it never touches
 * the developer's default `.anvesh` / `.env.anvesh`.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "../..");
export const E2E_ROOT = path.join(REPO_ROOT, "e2e", ".tmp");

export const PORTS = {
  engine: 14848,
  hub: 14849,
  spider: 14851,
  indexer: 14852,
  fixture: 14880,
  mockEs: 14890,
  mockSolr: 14891,
};

export interface E2EEnv {
  ANVESH_SECURE: string;
  ANVESH_STORAGE: string;
  ANVESH_DATA_DIR: string;
  ANVESH_PORT: string;
  ANVESH_HUB_PORT: string;
  ANVESH_HUB_DATA: string;
  ANVESH_HUB_ADMIN_USER: string;
  ANVESH_HUB_ADMIN_PASSWORD: string;
  ANVESH_HUB_SECRETS_KEY: string;
  ANVESH_API_KEY: string;
  ANVESH_SPIDER_API_KEY: string;
  ANVESH_INDEXER_API_KEY: string;
  ANVESH_SPIDER_PORT: string;
  ANVESH_INDEXER_PORT: string;
  ANVESH_LOG_PRETTY: string;
  ANVESH_MAX_BULK_DOCS: string;
  ANVESH_MAX_RESULT_WINDOW: string;
  ANVESH_MAX_DOCS_PER_INDEX: string;
  ANVESH_MAX_CONCURRENT_SEARCH: string;
}

export function makeEnv(): E2EEnv {
  return {
    ANVESH_SECURE: "1",
    ANVESH_STORAGE: "filesystem",
    ANVESH_DATA_DIR: path.join(E2E_ROOT, "data"),
    ANVESH_PORT: String(PORTS.engine),
    ANVESH_HUB_PORT: String(PORTS.hub),
    ANVESH_HUB_DATA: path.join(E2E_ROOT, "hub"),
    ANVESH_HUB_ADMIN_USER: "admin",
    ANVESH_HUB_ADMIN_PASSWORD: "e2e-admin-password-ok",
    ANVESH_HUB_SECRETS_KEY: randomBytes(32).toString("base64"),
    ANVESH_API_KEY: "e2e-engine-key",
    ANVESH_SPIDER_API_KEY: "e2e-spider-key",
    ANVESH_INDEXER_API_KEY: "e2e-indexer-key",
    ANVESH_SPIDER_PORT: String(PORTS.spider),
    ANVESH_INDEXER_PORT: String(PORTS.indexer),
    ANVESH_LOG_PRETTY: "0",
    ANVESH_MAX_BULK_DOCS: "50",
    ANVESH_MAX_RESULT_WINDOW: "100",
    ANVESH_MAX_DOCS_PER_INDEX: "200",
    ANVESH_MAX_CONCURRENT_SEARCH: "2",
  };
}

async function waitHealthy(url: string, label: string, timeoutMs = 60000): Promise<void> {
  const start = Date.now();
  let lastErr = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${label} not healthy at ${url} (${lastErr})`);
}

function spawnNode(script: string, args: string[], env: NodeJS.ProcessEnv, logName: string): ChildProcess {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: REPO_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prefix = `[${logName}]`;
  child.stdout?.on("data", (buf: Buffer) => {
    if (process.env.E2E_VERBOSE) process.stdout.write(`${prefix} ${buf}`);
  });
  child.stderr?.on("data", (buf: Buffer) => {
    if (process.env.E2E_VERBOSE) process.stderr.write(`${prefix} ${buf}`);
  });
  return child;
}

export interface FixtureSite {
  server: Server;
  baseUrl: string;
  close: () => Promise<void>;
}

/** Tiny local site for spider crawl e2e (no external network). */
export async function startFixtureSite(): Promise<FixtureSite> {
  const pages: Record<string, string> = {
    "/": `<!doctype html><html><head><title>E2E Home</title>
      <meta name="description" content="Anvesh e2e fixture home"></head>
      <body><h1>Welcome to E2E Home</h1>
      <p>Searchable body about alpine hiking trails and mountain gear.</p>
      <a href="/about">About</a><a href="/products">Products</a>
      <a href="/secret">Secret</a></body></html>`,
    "/about": `<!doctype html><html><head><title>About E2E</title></head>
      <body><h1>About</h1><p>We specialize in trail running shoes and backpacks.</p>
      <a href="/">Home</a></body></html>`,
    "/products": `<!doctype html><html><head><title>Products</title></head>
      <body><h1>Products</h1><p>Red running shoes and ceramic mugs for coffee.</p>
      <a href="/">Home</a></body></html>`,
    "/secret": `<!doctype html><html><head><title>Secret</title></head>
      <body><h1>Secret area</h1><p>Should be denied by path patterns.</p></body></html>`,
    "/robots.txt": `User-agent: *\nDisallow: /secret\nSitemap: http://127.0.0.1:${PORTS.fixture}/sitemap.xml\n`,
    "/sitemap.xml": `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>http://127.0.0.1:${PORTS.fixture}/about</loc></url>
      <url><loc>http://127.0.0.1:${PORTS.fixture}/products</loc></url>
      </urlset>`,
  };

  const server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0]!;
    const html = pages[url];
    if (!html) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    const type = url.endsWith(".xml")
      ? "application/xml"
      : url.endsWith(".txt")
        ? "text/plain"
        : "text/html; charset=utf-8";
    res.writeHead(200, { "content-type": type });
    res.end(html);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORTS.fixture, "127.0.0.1", () => resolve());
  });

  return {
    server,
    baseUrl: `http://127.0.0.1:${PORTS.fixture}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export interface StackHandle {
  env: E2EEnv;
  children: ChildProcess[];
  stop: () => Promise<void>;
}

export async function startStack(): Promise<StackHandle> {
  await rm(E2E_ROOT, { recursive: true, force: true });
  await mkdir(path.join(E2E_ROOT, "data"), { recursive: true });
  await mkdir(path.join(E2E_ROOT, "hub"), { recursive: true });
  await mkdir(path.join(E2E_ROOT, "logs"), { recursive: true });

  const env = makeEnv();
  await writeFile(
    path.join(E2E_ROOT, "env.json"),
    JSON.stringify(env, null, 2),
    "utf8",
  );

  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };

  const engineCli = path.join(REPO_ROOT, "apps/engine/dist/cli.js");
  const hubCli = path.join(REPO_ROOT, "apps/hub/dist/server/cli.js");
  const spiderCli = path.join(REPO_ROOT, "apps/spider/dist/cli.js");
  const indexerCli = path.join(REPO_ROOT, "apps/indexer/dist/cli.js");

  const children = [
    spawnNode(engineCli, ["serve"], childEnv, "engine"),
    spawnNode(hubCli, [], childEnv, "hub"),
    spawnNode(spiderCli, ["serve"], childEnv, "spider"),
    spawnNode(indexerCli, ["serve"], childEnv, "indexer"),
  ];

  const stop = async () => {
    for (const c of children) {
      if (!c.killed && c.pid) {
        try {
          process.kill(c.pid, "SIGTERM");
        } catch {
          /* already gone */
        }
      }
    }
    await Promise.all(
      children.map(
        (c) =>
          new Promise<void>((resolve) => {
            const t = setTimeout(() => {
              try {
                if (c.pid) process.kill(c.pid, "SIGKILL");
              } catch {
                /* ok */
              }
              resolve();
            }, 3000);
            c.on("exit", () => {
              clearTimeout(t);
              resolve();
            });
          }),
      ),
    );
    await rm(E2E_ROOT, { recursive: true, force: true }).catch(() => undefined);
  };

  try {
    await waitHealthy(`http://127.0.0.1:${PORTS.engine}/health`, "engine");
    await waitHealthy(`http://127.0.0.1:${PORTS.hub}/hub/health`, "hub");
    await waitHealthy(`http://127.0.0.1:${PORTS.spider}/health`, "spider");
    await waitHealthy(`http://127.0.0.1:${PORTS.indexer}/health`, "indexer");
  } catch (err) {
    await stop();
    throw err;
  }

  return { env, children, stop };
}

export class HubClient {
  constructor(
    private readonly baseUrl: string,
    private token = "",
  ) {}

  static forStack(env: E2EEnv): HubClient {
    return new HubClient(`http://127.0.0.1:${env.ANVESH_HUB_PORT}`);
  }

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = "";
  }

  async login(username: string, password: string): Promise<{ token: string; user: Record<string, unknown> }> {
    const res = await this.request<{ token: string; user: Record<string, unknown> }>(
      "POST",
      "/hub/auth/login",
      { username, password },
    );
    this.token = res.token;
    return res;
  }

  async requestRaw(
    method: string,
    urlPath: string,
    body?: unknown,
  ): Promise<{ status: number; ok: boolean; json: Record<string, unknown>; headers: Headers }> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    const res = await fetch(`${this.baseUrl}${urlPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, ok: res.ok, json, headers: res.headers };
  }

  async request<T = Record<string, unknown>>(
    method: string,
    urlPath: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.requestRaw(method, urlPath, body);
    if (!res.ok) {
      throw new Error(
        `${method} ${urlPath} → ${res.status}: ${(res.json.message as string) ?? JSON.stringify(res.json)}`,
      );
    }
    return res.json as T;
  }
}

export async function pollJob(
  hub: HubClient,
  jobId: string,
  timeoutMs = 90000,
): Promise<{
  status: string;
  message?: string;
  indexed?: number;
  pagesIndexed?: number;
}> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await hub.request("POST", `/hub/jobs/${jobId}/refresh`).catch(() => undefined);
    const list = await hub.request<{
      jobs: Array<{
        id: string;
        status: string;
        message?: string;
        indexed?: number;
        pagesIndexed?: number;
      }>;
    }>("GET", "/hub/jobs?from=0&size=50");
    const job = list.jobs.find((j) => j.id === jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      return job;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Job ${jobId} timed out`);
}

export async function engineRequest(
  env: E2EEnv,
  method: string,
  urlPath: string,
  body?: unknown,
  opts?: { apiKey?: string | null; headerName?: "authorization" | "x-api-key" },
): Promise<{ status: number; ok: boolean; json: Record<string, unknown>; headers: Headers }> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  const key = opts?.apiKey === null ? undefined : (opts?.apiKey ?? env.ANVESH_API_KEY);
  if (key) {
    if (opts?.headerName === "x-api-key") headers["x-api-key"] = key;
    else headers.authorization = `Bearer ${key}`;
  }
  const res = await fetch(`http://127.0.0.1:${env.ANVESH_PORT}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, ok: res.ok, json, headers: res.headers };
}

export async function workerRequest(
  port: number,
  apiKey: string,
  method: string,
  urlPath: string,
  body?: unknown,
  withAuth = true,
): Promise<{ status: number; ok: boolean; json: Record<string, unknown> }> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (withAuth) headers.authorization = `Bearer ${apiKey}`;
  const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, ok: res.ok, json };
}

/** Minimal Elasticsearch mock for Hub adapter proxy tests. */
export async function startMockElasticsearch(): Promise<FixtureSite> {
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url === "/" || url.startsWith("/_cluster/health")) {
      return send(200, { status: "green", cluster_name: "e2e-mock" });
    }
    if (url.startsWith("/_cat/indices")) {
      return send(200, [{ index: "mock-es-index", "docs.count": "2", "store.size": "1kb" }]);
    }
    if (url.includes("/_search")) {
      return send(200, {
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: "es1",
              _score: 1.2,
              _source: { title: "Elastic mock hit", body: "from mock ES" },
            },
          ],
        },
        took: 1,
      });
    }
    if (req.method === "PUT" || req.method === "POST") {
      return send(200, { acknowledged: true });
    }
    if (req.method === "DELETE") {
      return send(200, { acknowledged: true });
    }
    return send(404, { error: "not found" });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORTS.mockEs, "127.0.0.1", () => resolve());
  });
  return {
    server,
    baseUrl: `http://127.0.0.1:${PORTS.mockEs}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/** Minimal Solr mock for Hub adapter unsupported-feature tests. */
export async function startMockSolr(): Promise<FixtureSite> {
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.includes("/admin/ping") || url === "/") {
      return send(200, { status: "OK" });
    }
    if (url.includes("/select")) {
      return send(200, {
        response: {
          numFound: 1,
          docs: [{ id: "s1", title: "Solr mock", body: "from mock Solr" }],
        },
      });
    }
    if (url.includes("/update")) {
      return send(200, { responseHeader: { status: 0 } });
    }
    return send(404, { error: "not found" });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORTS.mockSolr, "127.0.0.1", () => resolve());
  });
  return {
    server,
    baseUrl: `http://127.0.0.1:${PORTS.mockSolr}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
