---
title: Architecture
section: Start
description: How Anvesh components work individually and as one system.
permalink: /architecture/
---

## Monorepo layout

```
anvesh/
├── apps/
│   ├── engine/     @vaagatech/anvesh-engine
│   ├── hub/        optional UI (private)
│   ├── indexer/    @vaagatech/anvesh-indexer
│   └── spider/     @vaagatech/anvesh-spider
├── packages/
│   └── shared/     @vaagatech/anvesh-shared
├── docs/           this GitHub Pages site
└── deploy/         ECS / Kubernetes manifests (optional)
```

## Collective system

```
                 ┌─────────────────────────────────────────┐
                 │              Anvesh system              │
                 │                                         │
  seeds/config ──▶ Spider ──JSONL──▶ Indexer ──bulk──▶ Engine
                 │   │                                      │
                 │   │ role passes                          │ search API
                 │   │ (guest/user/admin)                   ▼
                 │   └─────────────────────────────────▶  Hub (opt.)
                 │                                         │
                 │              Storage adapters           │
                 │     filesystem · Redis · S3 · DDB · Mongo
                 └─────────────────────────────────────────┘
```

### Responsibilities

| Component | Owns | Does not own |
|-----------|------|--------------|
| **Spider** | HTTP fetch, HTML extract, role sessions, crawl frontier | Ranking, persistence of search indexes |
| **Indexer** | Batching, mapping crawl docs → engine documents | Crawling, query serving |
| **Engine** | Inverted index, BM25, vectors, geo, HTTP API | Crawling UI |
| **Hub** | Operator UX for indexes/docs/search | Auth IdP, crawl orchestration |
| **Shared** | `CrawledPage`, spider config schema, doc mapping helpers | Runtime services |

### Trust boundaries

- Engine API may require `ANVESH_API_KEY`.
- Spider credentials (passwords, tokens) live only in spider config / env — never in the search index body if you can avoid it; use `meta` carefully.
- Hub stores API base/key in browser `localStorage` for convenience — use only on trusted networks or behind your SSO.

## Engine internals (summary)

1. **Analyzer** — tokenize, stopwords, light stem.
2. **Inverted index** — term postings + BM25.
3. **Vector store** — dense embeddings + cosine similarity.
4. **Geo** — haversine radius + bounding box on `geo_point` fields.
5. **Hybrid** — min-max blend of keyword + semantic scores.
6. **Storage adapter** — serializes index snapshots (JSON blobs).

On each mutation the engine marks the index dirty and flushes to storage. On startup it hydrates all indexes from storage into memory.

## Spider role model

For each configured role the spider:

1. Creates a `RoleSession` (cookies + headers).
2. Optionally performs form login or uses bearer/cookie auth.
3. BFS-crawls seeds (+ sitemaps + same-host links).
4. Skips 401/403 for that role.
5. Merges pages across roles, tagging `roles: ["guest","user"]` when multiple roles can fetch the URL.

## Indexer modes

| Mode | When |
|------|------|
| **In-process** | Same machine as data dir; uses `AnveshEngine` + filesystem/Redis/… |
| **HTTP** | `--engine-url` points at a running engine; POSTs `/documents/_bulk` |

## Scalability sketch

| Scale | Pattern |
|-------|---------|
| Laptop | Engine + filesystem; spider → indexer local |
| Single server | Engine + Redis/S3; spider/indexer as cron/Jobs |
| Multi-replica API | Shared storage (Redis/S3/Dynamo/Mongo); Hub/LB in front |
| Heavy crawl | Spider on a worker; indexer Job; engine stays lean |

## Related

- [Components overview]({{ '/components/' | relative_url }})
- [Indexing pipeline]({{ '/guides/indexing/' | relative_url }})
- [Deploy]({{ '/deploy/' | relative_url }})
