---
title: Indexing pipeline
section: Guides
description: From crawl files and JSON dumps to searchable engine indexes.
permalink: /guides/indexing/
---

## End-to-end

```
1. Spider writes JSONL (CrawledPage)
2. Indexer maps → engine documents
3. Engine BM25 / geo / vector search
4. (Optional) Hub to verify
```

## Local (recommended for development)

```bash
# Engine may already be running; indexer can also open storage directly
npm run start -w @vaagatech/anvesh-spider -- --seed https://example.com --out .anvesh/crawl/out.jsonl

npm run start -w @vaagatech/anvesh-indexer -- --index web --input .anvesh/crawl/out.jsonl

# Query
curl -s http://127.0.0.1:3848/v1/indexes/web/search \
  -H 'content-type: application/json' \
  -d '{"q":"example"}'
```

If the engine process and indexer both use `filesystem` on the **same** `ANVESH_DATA_DIR`, restart or re-init the engine after bulk loads so it reloads snapshots — or prefer **HTTP mode** against a live engine:

```bash
npm run start -w @vaagatech/anvesh-indexer -- \
  --index web \
  --input .anvesh/crawl/out.jsonl \
  --engine-url http://127.0.0.1:3848
```

HTTP mode updates the running process immediately.

## Document mapping

Spider pages become:

| Engine field | Content |
|--------------|---------|
| `title` | HTML title |
| `body` | Extracted text |
| `url` | Final URL |
| `description` | Meta description |
| `roles` | Role names |
| `status` | HTTP status |

## Batching

Default batch size is 50 (`INDEXER_DEFAULT_BATCH`). Override with `--batch-size`.

## Heavy loads

Run indexer on a separate machine/Job with the same storage backend or `--engine-url`. See [Deploy]({{ '/deploy/' | relative_url }}).
