---
title: Indexer
section: Components
description: Bulk-load JSON, JSONL, and spider output into the Anvesh engine.
permalink: /components/indexer/
---

## Purpose

The **indexer** is a worker CLI for heavy or batch ingestion. It reads documents from files/directories and writes them into an engine index — either **in-process** (same storage as local engine) or via **HTTP bulk API**.

Path: `apps/indexer` · Package: `@vaagatech/anvesh-indexer` · Bin: `anvesh-indexer`

## When to use it

- After a spider crawl (JSONL of `CrawledPage`)
- Loading fixture JSON dumps
- Separating write-heavy work from the query API process

## Inputs

| Format | Behavior |
|--------|----------|
| `.json` array | Each element → document |
| `.json` object | Single document |
| `.jsonl` | One JSON object per line |
| Directory | All `.json` / `.jsonl` files |

Objects shaped like spider `CrawledPage` (with `url`, `text`, `roles`, `finalUrl`) are mapped via `crawledPageToDocument` from shared.

Generic documents:

```json
{ "id": "1", "fields": { "title": "Hello", "body": "…" } }
```

## CLI

```bash
# In-process (filesystem / configured storage)
npm run start -w @vaagatech/anvesh-indexer -- \
  --index web \
  --input .anvesh/crawl/out.jsonl

# Remote engine
npm run start -w @vaagatech/anvesh-indexer -- \
  --index web \
  --input .anvesh/crawl/out.jsonl \
  --engine-url http://127.0.0.1:3848 \
  --api-key "$ANVESH_API_KEY"
```

| Flag | Meaning |
|------|---------|
| `--index` | Target index name (required) |
| `--input` | File or directory (required) |
| `--engine-url` | If set, use HTTP bulk instead of in-process |
| `--api-key` | Bearer token for remote engine |
| `--batch-size` | Bulk chunk size (default 50) |
| `--no-create` | Do not auto-create index in local mode |

## Local auto-create mappings

When creating an index automatically, indexer uses:

- `title`, `body`, `description`, `roles` → text  
- `url` → keyword  
- `status` → number  

Adjust the engine mappings yourself for geo/vectors if needed, then run with `--no-create`.

## Environment (in-process)

Same as engine: `ANVESH_STORAGE`, `ANVESH_DATA_DIR`, Redis/S3/etc.

## Related

- [Indexing pipeline]({{ '/guides/indexing/' | relative_url }})
- [Spider]({{ '/components/spider/' | relative_url }})
- [Shared]({{ '/components/shared/' | relative_url }})
