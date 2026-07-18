---
title: Storage
section: Guides
description: Where index snapshots live — filesystem, Redis, S3, DynamoDB, MongoDB.
permalink: /guides/storage/
---

## Model

The engine keeps indexes **in memory** for queries and **flushes JSON snapshots** through a storage adapter. Adapters are swappable; the ranking code does not change.

## Adapters

| Kind | Env | Best for |
|------|-----|----------|
| `filesystem` | `ANVESH_DATA_DIR` | Local dev, single replica + PVC |
| `memory` | — | Tests, ephemeral |
| `redis` | `REDIS_URL` | Multi-replica warm shared state |
| `s3` | `ANVESH_S3_BUCKET`, prefix | Durable object storage |
| `dynamodb` | `ANVESH_DDB_TABLE` | AWS item store for blobs |
| `mongodb` | `ANVESH_MONGO_URL` | Document DB blobs |

```bash
export ANVESH_STORAGE=filesystem   # default
export ANVESH_DATA_DIR=.anvesh/data
```

## Multi-replica rule

If you run **more than one** engine process, use **shared** storage (`redis`, `s3`, `dynamodb`, `mongodb`). Filesystem volumes are not coherently shared across pods/tasks unless you deliberately use a single-writer PVC.

## Snapshot contents

Each persisted index includes:

- Index definition (mappings, settings, counts)
- Inverted index postings / norms / stored docs
- Optional vector store snapshot

## Operations

- `/ready` pings storage when `ping()` is implemented.
- Storage failures surface as `ERR_STORAGE` (HTTP 503) with a clear user message.
- Filesystem writes use a temp file then replace for crash friendliness.

## Related env

See repo `.env.example` for S3/Redis/Dynamo/Mongo variables.
