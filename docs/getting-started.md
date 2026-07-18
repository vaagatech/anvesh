---
title: Getting started
section: Start
description: Run Anvesh locally with Node.js and filesystem storage — no Docker.
permalink: /getting-started/
---

## Requirements

- Node.js **20+**
- npm 9+ (workspaces)

## Install & build

```bash
git clone https://github.com/vaagatech/anvesh-monorepo.git
cd anvesh-monorepo
npm install
npm run build
npm run setup -- init
```

## Start the engine

```bash
set -a; source .env.anvesh; set +a
npm run start:engine
# → http://127.0.0.1:3848/health
```

Defaults:

| Variable | Default |
|----------|---------|
| `ANVESH_STORAGE` | `filesystem` |
| `ANVESH_DATA_DIR` | `.anvesh/data` |
| `ANVESH_PORT` | `3848` |

## First index & search

```bash
curl -s http://127.0.0.1:3848/v1/indexes -H 'content-type: application/json' -d '{
  "name": "articles",
  "mappings": {
    "title": { "type": "text" },
    "body": { "type": "text" },
    "tags": { "type": "keyword" }
  }
}'

curl -s http://127.0.0.1:3848/v1/indexes/articles/documents \
  -H 'content-type: application/json' -d '{
  "id": "1",
  "fields": {
    "title": "Hello Anvesh",
    "body": "Lightweight search by VaagaTech",
    "tags": "oss"
  }
}'

curl -s http://127.0.0.1:3848/v1/indexes/articles/search \
  -H 'content-type: application/json' -d '{ "q": "lightweight search", "highlight": true }'
```

Successful responses include a human-readable `message`, e.g.  
`Search completed successfully. Found 1 matching document(s) in 0.3ms.`

## Optional Hub

```bash
npm run start -w @vaagatech/anvesh-hub
# → http://127.0.0.1:3849
# login: admin / (see ANVESH_HUB_ADMIN_PASSWORD in .env.anvesh)
```

Register engine/spider/indexer instance URLs in Hub to manage indexes and jobs.

## Crawl a site, then index

```bash
npm run start -w @vaagatech/anvesh-spider -- \
  --seed https://example.com \
  --out .anvesh/crawl/out.jsonl

npm run start -w @vaagatech/anvesh-indexer -- \
  --index web \
  --input .anvesh/crawl/out.jsonl
```

## Library usage

```ts
import { AnveshEngine, MemoryStorage } from "@vaagatech/anvesh-engine";

const engine = new AnveshEngine(new MemoryStorage());
await engine.init();
await engine.createIndex("docs", { title: { type: "text" } });
await engine.indexDocument("docs", { fields: { title: "Hello" } });
console.log(engine.search("docs", { q: "hello" }));
```

## Verify

```bash
npm test
curl -s http://127.0.0.1:3848/health
```

## Next

- [Architecture]({{ '/architecture/' | relative_url }})
- [Engine component]({{ '/components/engine/' | relative_url }})
- [Search modes]({{ '/guides/search/' | relative_url }})
