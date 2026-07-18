---
title: Overview
section: Start
description: Lightweight full-text, semantic, and geo search for Node.js — by VaagaTech.
permalink: /
---

**Anvesh** is an open-source search stack you can run with plain Node.js. It is designed for teams that need Elasticsearch-like capability without operating a heavy cluster.

<div class="card-grid">
  <a href="{{ '/getting-started/' | relative_url }}"><strong>Getting started</strong><span>Install, run the engine locally, first search.</span></a>
  <a href="{{ '/architecture/' | relative_url }}"><strong>Architecture</strong><span>How spider, indexer, engine, and hub fit together.</span></a>
  <a href="{{ '/components/' | relative_url }}"><strong>Components</strong><span>Engine, Hub, Indexer, Spider, Shared — in detail.</span></a>
  <a href="{{ '/github-pages/' | relative_url }}"><strong>GitHub Pages</strong><span>Enable this site from the /docs folder (no CI).</span></a>
</div>

## What Anvesh includes

| Piece | npm / path | Role |
|-------|------------|------|
| **Engine** | `@vaagatech/anvesh-engine` · `apps/engine` | Search API + library (BM25, vectors, hybrid, geo) |
| **Hub** | `apps/hub` (not published) | Optional management UI |
| **Indexer** | `@vaagatech/anvesh-indexer` · `apps/indexer` | Bulk load JSON/JSONL into the engine |
| **Spider** | `@vaagatech/anvesh-spider` · `apps/spider` | Full-site crawl with role-based post-login discovery |
| **Shared** | `@vaagatech/anvesh-shared` · `packages/shared` | Crawl/index contracts used by spider & indexer |

## Collective flow

```
  Browser / API clients
           │
           ▼
     ┌───────────┐     optional
     │   Hub UI  │ ──────────────┐
     └───────────┘               │
                                 ▼
  Spider ──JSONL──▶ Indexer ──▶ Engine (:3848)
     │                            │
     │  roles: guest/user/admin   │  filesystem / Redis / S3 / DynamoDB / Mongo
     └────────────────────────────┘
```

1. **Spider** discovers pages (anonymous and authenticated roles).
2. **Indexer** bulk-writes documents into an index.
3. **Engine** serves keyword, semantic, hybrid, and geo search.
4. **Hub** is optional — the API works without it.

## Design principles

- **Local-first** — Node.js + filesystem; no Docker required for development.
- **Containers optional** — same process for ECS/EKS when you need them.
- **Meaningful messages** — Vaakly-inspired API `message` fields and log lines.
- **Hub optional** — core search never depends on the UI.
- **Open source** — MIT, by [VaagaTech](https://www.vaagatech.com).

## Next

- [Getting started]({{ '/getting-started/' | relative_url }})
- [HTTP API reference]({{ '/api/http/' | relative_url }})
- [Publish to npm]({{ '/publishing/' | relative_url }})
