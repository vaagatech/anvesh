#!/usr/bin/env node
/**
 * Anvesh CLI — serve API, run indexing worker, print health.
 */
import { listenAnvesh } from "./api/server.js";
import { createLogger, getLogger } from "./logging/logger.js";
import { createStorage, type StorageKind } from "./storage/index.js";
import { AnveshEngine } from "./core/engine.js";
import { readFile } from "node:fs/promises";

async function main(): Promise<void> {
  const [cmd = "serve", ...rest] = process.argv.slice(2);
  createLogger();

  if (cmd === "serve" || cmd === "start") {
    await listenAnvesh({
      storage: (process.env.ANVESH_STORAGE as StorageKind) || "filesystem",
    });
    return;
  }

  if (cmd === "health") {
    const port = process.env.ANVESH_PORT ?? "3848";
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
    return;
  }

  if (cmd === "index-file") {
    // Heavy indexing can run on a separate instance: anvesh index-file <index> <file.json>
    const [indexName, filePath] = rest;
    if (!indexName || !filePath) {
      console.error("Usage: anvesh index-file <index> <file.json>");
      process.exit(1);
    }
    const storage = createStorage({
      kind: (process.env.ANVESH_STORAGE as StorageKind) || "filesystem",
      path: process.env.ANVESH_DATA_DIR,
    });
    const engine = new AnveshEngine(storage);
    await engine.init();
    const raw = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    const docs = Array.isArray(raw) ? raw : [raw];
    const result = await engine.bulkIndex(
      indexName,
      docs.map((d) => {
        const row = d as {
          id?: string;
          fields?: Record<string, unknown>;
          vector?: number[];
          meta?: Record<string, unknown>;
        };
        return {
          id: row.id,
          fields: (row.fields ?? row) as Record<string, never>,
          vector: row.vector,
          meta: row.meta as Record<string, never> | undefined,
        };
      }),
    );
    getLogger().info(result, result.message);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(`Anvesh — lightweight search by VaagaTech (https://www.vaagatech.com)

Usage:
  anvesh serve              Start HTTP API (default: filesystem storage, port 3848)
  anvesh health             Hit local /health
  anvesh index-file <index> <file.json>
                            Bulk-index from a JSON file (local Node — no Docker)

Local (default — no Docker):
  ANVESH_STORAGE=filesystem
  ANVESH_DATA_DIR=.anvesh/data
  ANVESH_PORT=3848

Optional backends:
  ANVESH_STORAGE=memory|filesystem|s3|redis|dynamodb|mongodb
  ANVESH_API_KEY=...
  ANVESH_S3_BUCKET=...
  REDIS_URL=...
  ANVESH_DDB_TABLE=...
  ANVESH_MONGO_URL=...
`);
    return;
  }

  console.error(`Unknown command: ${cmd}. Run: anvesh help`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
