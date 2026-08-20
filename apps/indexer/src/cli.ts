#!/usr/bin/env node
/**
 * Anvesh Indexer — bulk-load documents into the engine (local library or HTTP API).
 * Uses streaming to handle multi-gigabyte corpora with zero OOM spikes.
 * VaagaTech · https://www.vaagatech.com
 */
import { readFile, readdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import readline from "node:readline";
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
  globalDeadLetter,
  globalResourceGuard,
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

async function streamDocuments(
  inputPath: string,
  onBatch: (batch: IndexDocumentPayload[]) => Promise<void>,
  baseBatchSize: number,
): Promise<{ total: number; batches: number }> {
  const abs = path.resolve(inputPath);
  const stat = await import("node:fs/promises").then((fs) => fs.stat(abs));
  const files: string[] = [];
  if (stat.isDirectory()) {
    const entries = await readdir(abs);
    for (const e of entries) {
      if (e.endsWith(".json") || e.endsWith(".jsonl") || e.endsWith(".ndjson")) {
        files.push(path.join(abs, e));
      }
    }
  } else {
    files.push(abs);
  }

  let total = 0;
  let batches = 0;
  let pendingBatch: IndexDocumentPayload[] = [];
  let sampleBytes = 2048;

  for (const file of files) {
    if (file.endsWith(".jsonl") || file.endsWith(".ndjson")) {
      const rl = readline.createInterface({
        input: createReadStream(file, { encoding: "utf8" }),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        sampleBytes = Math.max(sampleBytes, trimmed.length);
        try {
          const doc = toPayload(JSON.parse(trimmed));
          pendingBatch.push(doc);
          total++;
        } catch (err) {
          globalDeadLetter.record({
            source: "indexer",
            error: err instanceof Error ? err : String(err),
            payload: trimmed,
          });
        }

        const adaptiveBatchSize = globalResourceGuard.calculateAdaptiveChunkSize(
          pendingBatch.length,
          sampleBytes,
          baseBatchSize,
        );

        if (pendingBatch.length >= adaptiveBatchSize) {
          await globalResourceGuard.throttleIfNeeded("indexer.streamDocuments");
          const batch = pendingBatch.splice(0, pendingBatch.length);
          await onBatch(batch);
          batches++;
        }
      }
    } else {
      const text = await readFile(file, "utf8");
      const parsed = JSON.parse(text) as unknown;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        try {
          const doc = toPayload(item);
          pendingBatch.push(doc);
          total++;
        } catch (err) {
          globalDeadLetter.record({
            source: "indexer",
            error: err instanceof Error ? err : String(err),
            payload: item,
          });
        }

        const adaptiveBatchSize = globalResourceGuard.calculateAdaptiveChunkSize(
          pendingBatch.length,
          sampleBytes,
          baseBatchSize,
        );

        if (pendingBatch.length >= adaptiveBatchSize) {
          await globalResourceGuard.throttleIfNeeded("indexer.streamDocuments");
          const batch = pendingBatch.splice(0, pendingBatch.length);
          await onBatch(batch);
          batches++;
        }
      }
    }
  }

  if (pendingBatch.length > 0) {
    await globalResourceGuard.throttleIfNeeded("indexer.streamDocuments");
    const batch = pendingBatch.splice(0, pendingBatch.length);
    await onBatch(batch);
    batches++;
  }

  return { total, batches };
}

async function ensureIndex(
  engineUrl: string,
  apiKey: string | undefined,
  index: string,
): Promise<void> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const base = engineUrl.replace(/\/$/, "");
  const get = await fetch(`${base}/v1/indexes/${encodeURIComponent(index)}`, { headers });
  if (get.ok) return;
  await fetch(`${base}/v1/indexes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: index, mappings: WEB_MAPPINGS, settings: WEB_SETTINGS }),
  });
}

async function main(): Promise<void> {
  if (process.argv[2] === "serve") {
    const { startIndexerServer } = await import("./serve.js");
    startIndexerServer();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  if (!args.index || !args.input) usage();

  if (args.engineUrl) {
    await ensureIndex(args.engineUrl, args.apiKey, args.index).catch(() => {});
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (args.apiKey) headers.authorization = `Bearer ${args.apiKey}`;

    const { total, batches } = await streamDocuments(
      args.input,
      async (chunk) => {
        const res = await fetch(
          `${args.engineUrl!.replace(/\/$/, "")}/v1/indexes/${encodeURIComponent(args.index)}/documents/_bulk`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ documents: chunk }),
          },
        );
        const body = (await res.json().catch(() => ({}))) as { message?: string; ok?: boolean };
        if (!res.ok) {
          log.warn({ count: chunk.length, error: body.message }, "Batch indexing failed — isolated to dead-letter");
          for (const item of chunk) {
            globalDeadLetter.record({
              source: "indexer",
              targetIndex: args.index,
              error: body.message || `HTTP ${res.status}`,
              payload: item,
            });
          }
        } else {
          log.info({ count: chunk.length }, body.message ?? "batch indexed");
        }
      },
      args.batchSize,
    );
    log.info({ total, batches }, "Finished streaming indexing via HTTP.");
  } else {
    const storage = createStorage({
      kind: (process.env.ANVESH_STORAGE as StorageKind) || "filesystem",
      path: process.env.ANVESH_DATA_DIR,
    });
    const engine = new AnveshEngine(storage);
    await engine.init();

    if (args.createIndex) {
      try {
        await engine.createIndex(args.index, { ...WEB_MAPPINGS }, { ...WEB_SETTINGS });
        log.info({ index: args.index }, `Index "${args.index}" ready.`);
      } catch (err) {
        if (!(err instanceof Error) || !/already exists/i.test(err.message)) throw err;
      }
    }

    const { total, batches } = await streamDocuments(
      args.input,
      async (chunk) => {
        const result = await engine.bulkIndex(
          args.index,
          chunk.map((d) => ({
            id: d.id,
            fields: d.fields as Record<string, JsonValue>,
            vector: d.vector,
            meta: d.meta as Record<string, JsonValue> | undefined,
          })),
        );
        log.info({ indexed: result.indexed, failed: result.failed }, result.message);
      },
      args.batchSize,
    );
    log.info({ total, batches }, "Finished local streaming indexing.");
  }
}

main().catch((err) => {
  log.error(err, "Indexer failed");
  process.exit(1);
});
