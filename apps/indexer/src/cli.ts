#!/usr/bin/env node
/**
 * Anvesh Indexer — bulk-load documents into the engine (local library or HTTP API).
 * Suited for heavy indexing on a separate process/instance.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import { z } from "zod";
import {
  AnveshEngine,
  createStorage,
  type StorageKind,
  type JsonValue,
} from "@vaagatech/anvesh-engine";
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
  transport:
    process.env.ANVESH_LOG_PRETTY === "0"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
  base: { service: "anvesh-indexer", vendor: "vaagatech" },
});

const cliSchema = z.object({
  index: z.string().min(1),
  input: z.string().min(1),
  engineUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  batchSize: z.number().int().positive().default(INDEXER_DEFAULT_BATCH),
  createIndex: z.boolean().default(true),
});

function usage(): never {
  console.log(`Anvesh Indexer — by VaagaTech

Usage:
  anvesh-indexer serve                 HTTP worker for Hub (port 3852)
  anvesh-indexer --index <name> --input <file-or-dir.jsonl|json>

Options:
  --index          Target index name (required)
  --input          JSON array, JSON object, JSONL file, or directory of .jsonl/.json
  --engine-url     If set, POST to remote Anvesh engine API instead of in-process
  --api-key        Bearer token for remote engine
  --batch-size     Bulk batch size (default ${INDEXER_DEFAULT_BATCH})
  --no-create      Do not auto-create the index locally

Environment (local in-process mode):
  ANVESH_STORAGE=filesystem
  ANVESH_DATA_DIR=.anvesh/data
`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") usage();
    if (a === "--no-create") {
      out.createIndex = false;
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = val;
        i++;
      }
    }
  }
  return cliSchema.parse({
    index: out.index,
    input: out.input,
    engineUrl: out.engineUrl,
    apiKey: out.apiKey,
    batchSize: out.batchSize ? Number(out.batchSize) : INDEXER_DEFAULT_BATCH,
    createIndex: out.createIndex !== false,
  });
}

function isCrawledPage(v: unknown): v is CrawledPage {
  return (
    typeof v === "object" &&
    v !== null &&
    "url" in v &&
    "text" in v &&
    "roles" in v &&
    "finalUrl" in v
  );
}

function toPayload(raw: unknown): IndexDocumentPayload {
  if (isCrawledPage(raw)) return enrichIndexDocument(crawledPageToDocument(raw));
  const row = raw as IndexDocumentPayload & { fields?: Record<string, unknown> };
  if (row.fields) return enrichIndexDocument(row);
  return enrichIndexDocument({ fields: (raw as Record<string, unknown>) ?? {} });
}

async function loadDocuments(inputPath: string): Promise<IndexDocumentPayload[]> {
  const abs = path.resolve(inputPath);
  const stat = await import("node:fs/promises").then((fs) => fs.stat(abs));
  const files: string[] = [];
  if (stat.isDirectory()) {
    const entries = await readdir(abs);
    for (const e of entries) {
      if (e.endsWith(".json") || e.endsWith(".jsonl") || e.endsWith(".ndjson")) files.push(path.join(abs, e));
    }
  } else {
    files.push(abs);
  }

  const docs: IndexDocumentPayload[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (file.endsWith(".jsonl") || file.endsWith(".ndjson")) {
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        docs.push(toPayload(JSON.parse(trimmed)));
      }
    } else {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) docs.push(toPayload(item));
      } else {
        docs.push(toPayload(parsed));
      }
    }
  }
  return docs;
}

async function indexViaHttp(
  engineUrl: string,
  apiKey: string | undefined,
  index: string,
  docs: IndexDocumentPayload[],
  batchSize: number,
): Promise<void> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const res = await fetch(`${engineUrl.replace(/\/$/, "")}/v1/indexes/${encodeURIComponent(index)}/documents/_bulk`, {
      method: "POST",
      headers,
      body: JSON.stringify({ documents: chunk }),
    });
    const body = (await res.json()) as { message?: string; ok?: boolean };
    if (!res.ok) {
      throw new Error(body.message ?? `Bulk index failed (${res.status})`);
    }
    log.info({ batch: i / batchSize + 1, count: chunk.length }, body.message ?? "batch indexed");
  }
}

async function indexLocal(
  index: string,
  docs: IndexDocumentPayload[],
  batchSize: number,
  createIndex: boolean,
): Promise<void> {
  const storage = createStorage({
    kind: (process.env.ANVESH_STORAGE as StorageKind) || "filesystem",
    path: process.env.ANVESH_DATA_DIR,
  });
  const engine = new AnveshEngine(storage);
  await engine.init();

  if (createIndex) {
    try {
      await engine.createIndex(index, { ...WEB_MAPPINGS }, { ...WEB_SETTINGS });
      log.info({ index }, `Index "${index}" is ready for bulk load (dynamic schema).`);
    } catch (err) {
      if (!(err instanceof Error) || !/already exists/i.test(err.message)) throw err;
      log.info({ index }, `Index "${index}" already exists — appending documents.`);
    }
  }

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const result = await engine.bulkIndex(
      index,
      chunk.map((d) => ({
        id: d.id,
        fields: d.fields as Record<string, JsonValue>,
        vector: d.vector,
        meta: d.meta as Record<string, JsonValue> | undefined,
      })),
    );
    log.info(
      { indexed: result.indexed, failed: result.failed },
      result.message,
    );
  }
}

async function main(): Promise<void> {
  if (process.argv[2] === "serve") {
    const { startIndexerServer } = await import("./serve.js");
    startIndexerServer();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  if (!args.index || !args.input) usage();

  const docs = await loadDocuments(args.input);
  log.info({ count: docs.length, input: args.input }, "Loaded documents for indexing.");

  if (docs.length === 0) {
    log.warn("No documents found — nothing to index.");
    return;
  }

  if (args.engineUrl) {
    await indexViaHttp(args.engineUrl, args.apiKey, args.index, docs, args.batchSize);
  } else {
    await indexLocal(args.index, docs, args.batchSize, args.createIndex);
  }

  log.info("Indexing finished successfully.");
}

main().catch((err) => {
  log.error(err, "Indexer failed");
  process.exit(1);
});
