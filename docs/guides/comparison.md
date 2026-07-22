---
title: Anvesh vs Elasticsearch
section: Guides
description: Honest feature matrix with HAVE / NATIVE / NICE-light / SKIP / NEVER tags — when to stay native vs use an adapter.
permalink: /guides/comparison/
---

**Principle:** Elasticsearch is a distributed search *platform*. **Anvesh** is a lightweight Node.js engine + Hub control plane. We do not aim for ES parity — this page lists gaps so you can pick the right backend.

For wiring external clusters see [Search adapters]({{ '/guides/adapters/' | relative_url }}).

## Tag legend

| Tag | Meaning |
|-----|---------|
| **HAVE** | Already in Anvesh |
| **NATIVE** | Implemented in the Anvesh engine (small, high value) |
| **NICE-light** | Lightweight native subset — not a full ES clone |
| **SKIP** | Do not build natively — use ES/OpenSearch/Solr **adapter** when needed |
| **NEVER** | Out of scope for a light in-process engine (cluster/platform features) |

---

## A. Query & ranking

| Feature | Anvesh | Elasticsearch | Tag |
|---------|--------|---------------|-----|
| BM25 keyword | Yes | Yes | **HAVE** |
| Boolean filters (term / range) | Yes | `bool` / `filter` | **HAVE** |
| Geo radius / bbox / distance sort | Yes | Yes | **HAVE** |
| Vector / cosine similarity | Brute-force kNN | `dense_vector` + ANN | **HAVE** (fine for small/medium; HNSW → **SKIP**) |
| Hybrid BM25 + vector | Yes | RRF / pipelines | **HAVE** |
| Local auto-embed | Yes | External model | **HAVE** |
| Fuzzy (edit distance) | `fuzziness`: `AUTO` / 0 / 1 / 2 | Yes | **NATIVE** |
| Match phrase + slop | Yes | `match_phrase` | **NATIVE** |
| Prefix | Yes | `prefix` / `match_bool_prefix` | **NATIVE** |
| Trailing `*` / single-char `?` wildcards | Term-level only | Full wildcard | **NICE-light** |
| Field boosts map | `boosts: { title: 2 }` | `multi_match` boosts | **NICE-light** |
| Bool subset (`must` / `should` / `mustNot`) | Flat term arrays | Full Query DSL tree | **NICE-light** |
| Prefix suggester | `POST …/suggest` from term dict | Completion FST | **NICE-light** |
| Highlighting | Basic | Unified / FVH | **HAVE** (polish later) |
| Full Query DSL tree | Flat JSON only | Rich nested DSL | **SKIP** |
| `multi_match` types (cross_fields, …) | `q` + `fields[]` | Many | **SKIP** |
| Wildcard / regexp (full Lucene) | — | Yes | **SKIP** |
| Function score / script score | — | Yes | **SKIP** |
| More-like-this | — | Yes | **SKIP** |
| Full completion / phrase suggesters | — | Yes | **SKIP** |
| Rescoring / native RRF | Hybrid blend only | RRF | **SKIP** |
| Percolator | — | Yes | **NEVER** |
| SQL / ESQL | — | Yes | **NEVER** |

---

## B. Analysis & mappings

| Feature | Anvesh | Elasticsearch | Tag |
|---------|--------|---------------|-----|
| text / keyword / number / boolean / date / geo_point / vector | Yes | Yes (+ many) | **HAVE** |
| Custom analyzer chains | standard + keyword | Plugin ecosystem | **SKIP** |
| ICU / language analyzers | — | Yes | **SKIP** |
| Synonym graph (index-time) | Query-time expand only | Full | **SKIP** |
| Dynamic mapping | Yes (`settings.dynamicMapping`, default on) | Dynamic | **HAVE** |
| Nested / object / join | — | Yes | **NEVER** nested/join |
| Runtime fields | — | Yes | **NEVER** |

---

## C. Aggregations & analytics

| Feature | Anvesh | Elasticsearch | Tag |
|---------|--------|---------------|-----|
| Terms facets | Yes | `terms` | **HAVE** |
| Stats (min / max / avg / sum / count) | `stats:field` facet kind | `stats` agg | **NICE-light** |
| Numeric histogram | `histogram:field:interval` | `histogram` | **NICE-light** |
| date_histogram / cardinality / pipeline aggs | — | Yes | **SKIP** |
| Composite / bucket sort | — | Yes | **NEVER** |

---

## D. Indexing & APIs

| Feature | Anvesh | Elasticsearch | Tag |
|---------|--------|---------------|-----|
| CRUD index + docs + bulk | Yes | Yes | **HAVE** |
| Update-by-query (set fields, no scripts) | Yes, batched + circuit-broken | Yes + Painless | **NICE-light** |
| Index aliases | `PUT /v1/aliases/:name` | Yes | **NICE-light** |
| Deep pagination cursor | `search_after` (doc id) | `search_after` / PIT | **NICE-light** (`from`/`size` → **HAVE**; scroll/PIT → **SKIP**) |
| Partial doc merge (`_update`) | Full replace upsert | Partial | **SKIP** (light merge later) |
| Delete-by-query | — | Yes | **SKIP** |
| Multi-search `_msearch` | — | Yes | **SKIP** |
| Ingest pipelines | Hub/spider/indexer | Ingest node | **NEVER** native |
| Index templates / data streams | — | Yes | **NEVER** |

---

## E. Scale, ops, cluster

| Feature | Anvesh | Elasticsearch | Tag |
|---------|--------|---------------|-----|
| Single-process + snapshot storage | Yes | Multi-node | **HAVE** — product identity |
| Sharding / replicas / cluster state | — | Yes | **NEVER** |
| Segment merge / Lucene codec | Custom inverted index | Lucene | **NEVER** |
| Snapshot/restore (files / S3) | Storage adapters | ES snapshots | **HAVE** (enough for most) |
| ILM / CCR / searchable snapshots | — | Yes | **NEVER** |
| Monitoring / APM / ML jobs | — | Yes | **NEVER** |
| Circuit breakers | Node RSS / concurrency / bulk caps | JVM breakers | **NATIVE** (see below) |

When you need cluster scale → register an **Elasticsearch / OpenSearch / Solr** instance in Hub. Do not grow Anvesh into Lucene-on-JVM.

---

## F. Security & control plane

| Feature | Anvesh | Elasticsearch | Tag |
|---------|--------|---------------|-----|
| API key on engine | Yes | Yes | **HAVE** |
| Hub RBAC (admin / operator / viewer) | Yes | X-Pack (limited) | **HAVE** |
| Secure credentials mode | Encrypted keys at rest | — | **NATIVE** |
| Hub audit log | Yes | Yes | **HAVE** |
| Document / field-level security (X-Pack DLS) | — | Yes | **SKIP** |

---

## Recommended pick list

**Use native Anvesh when you need:**

1. One-command local stack (`npm start`)
2. Hybrid + geo + auto-embed without external models
3. Hub crawl → index → search workflow
4. Circuit breakers protecting a single Node process
5. Fuzzy / phrase / prefix + light nice-to-haves above

**Register an adapter when you need:**

- Full Query DSL, script scoring, rich aggregations
- Cluster scale, sharding, ILM, CCR
- Existing ES/OS/Solr investment

**Never expect in Anvesh:** sharding, percolator, ES SQL, ML jobs, nested/join types, ingest-node pipelines.

---

## Circuit breakers (native MUST)

In-process Anvesh has no JVM heap guard — **circuit breakers** cap runaway load:

| Breaker | Env var (default) | On trip |
|---------|-------------------|---------|
| Request body size | `ANVESH_MAX_BODY_BYTES` (5 MB) | 413 `ERR_CIRCUIT_BODY` |
| Bulk batch size | `ANVESH_MAX_BULK_DOCS` (1000) | 400 `ERR_CIRCUIT_BULK` |
| Concurrent searches | `ANVESH_MAX_CONCURRENT_SEARCH` (32) | 429 `ERR_CIRCUIT_CONCURRENT` |
| Result window | `ANVESH_MAX_RESULT_WINDOW` (10 000) | 400 `ERR_CIRCUIT_RESULT_WINDOW` |
| Index doc cap | `ANVESH_MAX_DOCS_PER_INDEX` (0 = off) | 429 `ERR_CIRCUIT_DOCS` |
| Process RSS | `ANVESH_MAX_RSS_MB` (0 = off) | 429 `ERR_CIRCUIT_MEMORY` |
| Fuzzy expansion | `ANVESH_MAX_FUZZY_CANDIDATES` (50) | Truncate + `x-anvesh-fuzzy-capped: 1` |

Tripped counters appear on `/health` and `/v1/stats`. See [HTTP API]({{ '/api/http/' | relative_url }}) and [SECURITY.md](https://github.com/vaagatech/anvesh-monorepo/blob/main/SECURITY.md).

---

## Next

- [Why Anvesh]({{ '/why-anvesh/' | relative_url }}) — market landscape & when to choose Anvesh
- [Search adapters]({{ '/guides/adapters/' | relative_url }})
- [Operator guide]({{ '/operator-guide/' | relative_url }})
- [Search modes]({{ '/guides/search/' | relative_url }})
