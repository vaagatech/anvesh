---
title: Overview
section: Start
description: Lightweight, enterprise-grade search engine & vector database for Node.js — by VaagaTech.
permalink: /
---

**Anvesh** is an open-source, high-performance search engine and vector database in plain Node.js. It is designed for teams that need Elasticsearch-like BM25 precision, native Vector DB similarity search (HNSW, SQ8), hybrid Reciprocal Rank Fusion (RRF), and sub-millisecond latency — scaling seamlessly from embedded small projects to distributed TB-scale workloads.

<div class="card-grid">
  <a href="{{ '/features/' | relative_url }}"><strong>Product Features</strong><span>Complete technical feature catalog & capabilities.</span></a>
  <a href="{{ '/market-comparison/' | relative_url }}"><strong>Market Comparison</strong><span>Anvesh vs. Elasticsearch, OpenSearch, Meilisearch, Pinecone & Milvus.</span></a>
  <a href="{{ '/why-anvesh/' | relative_url }}"><strong>Why Anvesh</strong><span>Market fit, architecture advantages, and zero-ops footprint.</span></a>
  <a href="{{ '/use-cases/' | relative_url }}"><strong>Use Cases</strong><span>Product search, docs, RAG corpora, geo, and hybrid backends.</span></a>
  <a href="{{ '/getting-started/' | relative_url }}"><strong>Getting Started</strong><span>Install, configuration, and first curl search in 30 seconds.</span></a>
  <a href="{{ '/demo/' | relative_url }}"><strong>Interactive Demo</strong><span>Try keyword, semantic vector, and hybrid search in real-time.</span></a>
  <a href="{{ '/architecture/' | relative_url }}"><strong>Architecture</strong><span>Scatter-gather clustering, DFS storage, and monorepo design.</span></a>
  <a href="{{ '/operator-guide/' | relative_url }}"><strong>Operator Guide</strong><span>Hub control plane, RBAC roles, and production operations.</span></a>
</div>

## Quick start

```bash
npm install
npm start                 # engine + hub + spider + indexer
npm start -- --seed       # …and seed index "demo"
```

Open Hub at http://127.0.0.1:3849 · Stop with `npm run stop`.

## Key Architectural Highlights

- **Nano-to-Millisecond Latency**: Built-in LRU query caching (<0.1ms) and SIMD-optimized Float32Array vector math.
- **Unified Search & Vector DB**: One engine for BM25 text scoring, HNSW ANN graph vector search, SQ8 8-bit quantization, and Reciprocal Rank Fusion (RRF).
- **Distributed File System (DFS) Storage**: Block-chunked persistence (`blockSizeMb`) designed for distributed mounts (HDFS, CephFS, NFS, Object Storage) supporting TB-scale index data.
- **Scatter-Gather Cluster Coordinator**: Multi-shard distributed search with FNV-1a document partitioning, parallel shard queries, and map-reduce facet merging.
- **Zero-Dependency & Compact**: Base memory footprint of ~30 MB RAM with zero Java/JVM or external database dependencies.

## Monorepo Components

| Component | Package / Path | Role |
| :--- | :--- | :--- |
| **Engine** | `@vaagatech/anvesh-engine` · `apps/engine` | Search & Vector DB API (BM25, HNSW, SQ8, RRF, DFS, Geo) |
| **Hub** | `@vaagatech/anvesh-hub` · `apps/hub` | Control plane UI with RBAC over instances & indexes |
| **Indexer** | `@vaagatech/anvesh-indexer` · `apps/indexer` | Bulk load JSON/JSONL into the engine |
| **Spider** | `@vaagatech/anvesh-spider` · `apps/spider` | Full-site crawl with role-based post-login discovery |
| **Setup** | `@vaagatech/anvesh-setup` · `apps/setup` | Easy local installer & scaffold |
| **Shared** | `@vaagatech/anvesh-shared` · `packages/shared` | Crawl/index contracts used by spider & indexer |
| **Plugins** | `@vaagatech/anvesh-plugins` · `packages/plugins` | LLM-tool-style plugin registry |
| **Vaakly** | `@vaagatech/vaakly` · `packages/vaakly` | Corrected API summary messages (default plugin) |
| **Search Adapters** | `@vaagatech/anvesh-search-adapters` | Elasticsearch / OpenSearch / Solr proxy adapters |

## System Workflow

```
  Browser / API clients
           │
           ▼
     ┌───────────┐     optional
     │   Hub UI  │ ──────────────┐
     └───────────┘               │
                                 ▼
  Spider ──JSONL──▶ Indexer ──▶ Engine (:3848) ──▶ Scatter-Gather Cluster
     │                            │
     │  roles: guest/user/admin   │  DFS / S3 / Redis / DynamoDB / Mongo / Filesystem
     └────────────────────────────┘
```

1. **Spider** discovers pages (anonymous and authenticated roles).
2. **Indexer** bulk-writes documents into an index.
3. **Engine** serves keyword, semantic vector (HNSW/SQ8), hybrid RRF, and geo search.
4. **Hub** acts as the RBAC control plane for instances, indexes, jobs, and telemetry.
