#!/usr/bin/env node
/**
 * Seed the Anvesh `demo` index for local and hosted rehearsals.
 *
 * Env:
 *   ANVESH_DEMO_URL  (default http://127.0.0.1:3848)
 *   ANVESH_API_KEY   (optional Bearer token)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = (process.env.ANVESH_DEMO_URL ?? "http://127.0.0.1:3848").replace(/\/$/, "");
const apiKey = process.env.ANVESH_API_KEY ?? "";
const indexName = "demo";

const articles = JSON.parse(readFileSync(path.join(__dirname, "articles.json"), "utf8"));

function headers(hasBody) {
  const h = { accept: "application/json" };
  if (hasBody) h["content-type"] = "application/json";
  if (apiKey) h.authorization = `Bearer ${apiKey}`;
  return h;
}

async function request(method, urlPath, body) {
  const hasBody = body !== undefined;
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: headers(hasBody),
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { message: text };
  }
  return { status: res.status, ok: res.ok, json };
}

async function ensureIndex() {
  const existing = await request("GET", `/v1/indexes/${encodeURIComponent(indexName)}`);
  if (existing.ok) {
    console.log(`Recreating index "${indexName}" with fresh local embeddings…`);
    const deleted = await request("DELETE", `/v1/indexes/${encodeURIComponent(indexName)}`);
    if (!deleted.ok && deleted.status !== 404) {
      throw new Error(
        `Could not recreate index "${indexName}" (HTTP ${deleted.status}): ${deleted.json?.message ?? ""}`,
      );
    }
  } else if (existing.status !== 404) {
    throw new Error(
      `Could not check index "${indexName}" (HTTP ${existing.status}): ${existing.json?.message ?? ""}`,
    );
  }
  const created = await request("POST", "/v1/indexes", {
    name: indexName,
    mappings: {
      title: { type: "text" },
      body: { type: "text" },
      tags: { type: "keyword" },
      location: { type: "geo_point" },
    },
    settings: {
      vectorDimensions: 256,
      autoEmbed: true,
      hybridKeywordWeight: 0.55,
    },
  });
  if (!created.ok && created.status !== 409) {
    throw new Error(
      `Failed to create index "${indexName}" (HTTP ${created.status}): ${created.json?.message ?? ""}`,
    );
  }
  console.log(`Created index "${indexName}" (vectorDimensions=256, autoEmbed).`);
}

async function bulkSeed() {
  const bulk = await request("POST", `/v1/indexes/${encodeURIComponent(indexName)}/documents/_bulk`, {
    documents: articles,
  });
  if (!bulk.ok) {
    throw new Error(`Bulk seed failed (HTTP ${bulk.status}): ${bulk.json?.message ?? ""}`);
  }
  const result = bulk.json?.result ?? bulk.json;
  const indexed = result?.indexed ?? articles.length;
  const failed = result?.failed ?? 0;
  console.log(`Seeded ${indexed} document(s) into "${indexName}" (${failed} failed).`);
}

async function main() {
  console.log(`Anvesh demo seed → ${baseUrl}`);
  const health = await request("GET", "/health");
  if (!health.ok) {
    throw new Error(
      `Engine not reachable at ${baseUrl}. Start it first (npm run start:engine).`,
    );
  }
  await ensureIndex();
  await bulkSeed();

  console.log(`
Sample searches:

  curl -s ${baseUrl}/v1/indexes/demo/search \\
    -H 'content-type: application/json' \\
    -d '{"q":"lightweight search","highlight":true}'

  curl -s ${baseUrl}/v1/indexes/demo/search \\
    -H 'content-type: application/json' \\
    -d '{"q":"hub rbac","mode":"hybrid"}'

  curl -s ${baseUrl}/v1/indexes/demo/search \\
    -H 'content-type: application/json' \\
    -d '{"mode":"geo","geo":{"field":"location","origin":{"lat":12.9716,"lon":77.5946},"distanceKm":15,"sortByDistance":true}}'

Hub: open Search, pick index "demo" — hybrid works with plain text (local embeddings).
`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
