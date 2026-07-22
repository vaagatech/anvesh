---
title: Getting started
section: Start
description: Run Anvesh locally with Node.js and filesystem storage — no Docker.
permalink: /getting-started/
---

## Requirements

- Node.js **20+**
- npm 9+ (workspaces)

## Fastest path — full stack

```bash
git clone https://github.com/vaagatech/anvesh-monorepo.git
cd anvesh-monorepo
npm install
npm start                 # build (if needed) → init → engine + hub + spider + indexer
# optional demo corpus:
npm start -- --seed
```

Open Hub at http://127.0.0.1:3849 (`admin` / password in `.env.anvesh`). See the [Operator guide]({{ '/operator-guide/' | relative_url }}) for the Dashboard checklist.

Stop with `npm run stop`.

## Engine only (advanced)

```bash
npm run build
npm run setup -- init
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
`Search completed. Found 1 matching document in 0.3ms.`

## Hub

After `npm start`, Hub is at http://127.0.0.1:3849 with local instances pre-registered. To run Hub alone:

```bash
npm run start -w @vaagatech/anvesh-hub
# login: admin / (see ANVESH_HUB_ADMIN_PASSWORD in .env.anvesh)
```

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

- [Operator guide]({{ '/operator-guide/' | relative_url }})
- [Architecture]({{ '/architecture/' | relative_url }})
- [Engine component]({{ '/components/engine/' | relative_url }})
- [Search modes]({{ '/guides/search/' | relative_url }})
