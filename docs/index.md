---
title: Overview
section: Start
description: Lightweight full-text, semantic, and geo search for Node.js — by VaagaTech.
permalink: /
---

**Anvesh** is an open-source search stack you can run with plain Node.js. It is designed for teams that need Elasticsearch-like capability without operating a heavy cluster — and for teams that want crawl → index → search in one product.

<div class="card-grid">
  <a href="{{ '/why-anvesh/' | relative_url }}"><strong>Why Anvesh</strong><span>Market fit, similar products, and when we recommend it.</span></a>
  <a href="{{ '/use-cases/' | relative_url }}"><strong>Use cases</strong><span>Product search, docs, crawl, RAG, geo, hybrid backends.</span></a>
  <a href="{{ '/operator-guide/' | relative_url }}"><strong>Operator guide</strong><span>Happy path: Dashboard → indexes → crawl → search.</span></a>
  <a href="{{ '/getting-started/' | relative_url }}"><strong>Getting started</strong><span>Install, env vars, first curl search.</span></a>
  <a href="{{ '/demo/' | relative_url }}"><strong>Demo</strong><span>Seed the demo index, Hub walkthrough, and try-it search.</span></a>
  <a href="{{ '/architecture/' | relative_url }}"><strong>Architecture</strong><span>How spider, indexer, engine, and hub fit together.</span></a>
</div>

## Quick start

```bash
npm install
npm start                 # engine + hub + spider + indexer
npm start -- --seed       # …and seed index "demo"
```

Open Hub at http://127.0.0.1:3849 · Stop with `npm run stop`.

## What Anvesh includes

| Piece | npm / path | Role |
|-------|------------|------|
| **Engine** | `@vaagatech/anvesh-engine` · `apps/engine` | Search API + library (BM25, vectors, hybrid, geo) |
| **Hub** | `@vaagatech/anvesh-hub` · `apps/hub` | Control plane UI with RBAC over instances & indexes |
| **Indexer** | `@vaagatech/anvesh-indexer` · `apps/indexer` | Bulk load JSON/JSONL into the engine |
| **Spider** | `@vaagatech/anvesh-spider` · `apps/spider` | Full-site crawl with role-based post-login discovery |
| **Setup** | `@vaagatech/anvesh-setup` · `apps/setup` | Easy local installer / scaffold |
| **Shared** | `@vaagatech/anvesh-shared` · `packages/shared` | Crawl/index contracts used by spider & indexer |
| **Plugins** | `@vaagatech/anvesh-plugins` · `packages/plugins` | LLM-tool-style plugin registry |
| **Vaakly** | `@vaagatech/vaakly` · `packages/vaakly` | Corrected API summary messages (default plugin) |
| **Search adapters** | `@vaagatech/anvesh-search-adapters` | Elasticsearch / OpenSearch / Solr backends |

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
4. **Hub** is optional for search, but when configured it is the control plane for instances, indexes, spider/indexer jobs, and RBAC.

## Design principles

- **Local-first** — Node.js + filesystem; no Docker required for development.
- **Containers optional** — same process for ECS/EKS when you need them.
- **Meaningful messages** — Vaakly-inspired API `message` fields and log lines.
- **Hub optional** — core search never depends on the UI.
- **Open source** — MIT, by [VaagaTech](https://www.vaagatech.com).

## Next

- [Why Anvesh]({{ '/why-anvesh/' | relative_url }}) — market landscape & recommendations
- [Use cases]({{ '/use-cases/' | relative_url }})
- [Operator guide]({{ '/operator-guide/' | relative_url }})
- [Demo]({{ '/demo/' | relative_url }})
- [Getting started]({{ '/getting-started/' | relative_url }})
- [Anvesh vs Elasticsearch]({{ '/guides/comparison/' | relative_url }})
- [Plugins]({{ '/guides/plugins/' | relative_url }})
- [Versioning & releases]({{ '/versioning/' | relative_url }})
- [HTTP API reference]({{ '/api/http/' | relative_url }})
- [Publish to npm]({{ '/publishing/' | relative_url }})
