---
title: Library API
section: Guides
description: Embed AnveshEngine in your own Node.js process.
permalink: /api/library/
---

## Install

```bash
npm install @vaagatech/anvesh-engine
```

## Quick start

```ts
import {
  AnveshEngine,
  MemoryStorage,
  FilesystemStorage,
  createStorage,
  createLogger,
} from "@vaagatech/anvesh-engine";

createLogger({ pretty: true });

const storage = createStorage({ kind: "filesystem", path: ".anvesh/data" });
// or: new MemoryStorage() / new FilesystemStorage(".anvesh/data")

const engine = new AnveshEngine(storage);
await engine.init();

await engine.createIndex("docs", {
  title: { type: "text" },
  body: { type: "text" },
});

await engine.indexDocument("docs", {
  id: "1",
  fields: { title: "Anvesh", body: "Search by VaagaTech" },
});

const result = engine.search("docs", { q: "search", highlight: true });
console.log(result.message, result.hits);
```

## Main exports

| Export | Purpose |
|--------|---------|
| `AnveshEngine` | Create/search/delete indexes & docs |
| `createStorage` / adapters | Persistence backends |
| `createAnveshApp` / `listenAnvesh` | Embed or start HTTP server |
| `tokenize` / `stem` | Analyzer helpers |
| `haversineKm` / `parseGeoPoint` | Geo helpers |
| `formatMessage` / `AnveshError` | Messaging |

## Engine methods

| Method | Description |
|--------|-------------|
| `init()` | Load snapshots from storage |
| `createIndex(name, mappings, settings?)` | Define schema |
| `deleteIndex(name)` | Drop |
| `listIndexes()` / `getIndex(name)` | Metadata |
| `indexDocument` / `bulkIndex` | Ingest |
| `deleteDocument` / `getDocument` | CRUD |
| `search(name, query)` | Keyword / semantic / hybrid / geo |
| `flush(name?)` | Persist dirty indexes |
| `stats()` | Counts |

## HTTP from library

```ts
import { listenAnvesh } from "@vaagatech/anvesh-engine";

await listenAnvesh({
  storage: "filesystem",
  apiKey: process.env.ANVESH_API_KEY,
  port: 3848,
});
```

## Errors

Throw `AnveshError` with `.code`, `.httpStatus`, `.message` (user-facing).
