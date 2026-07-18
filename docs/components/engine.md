---
title: Engine
section: Components
description: Search API and library — BM25, vectors, hybrid, and geo (apps/engine).
permalink: /components/engine/
---

## Purpose

The **engine** is the core of Anvesh: create indexes, ingest documents, and run search queries. It ships as:

- An HTTP server (Fastify) on port `3848`
- A TypeScript library (`AnveshEngine`)
- Optional Lambda adapter (example only)
- CLI: `anvesh-engine`

Path: `apps/engine` · Package: `@vaagatech/anvesh-engine`

## When to use it

- Anytime you need search (always required for query serving)
- As an embedded library inside your Node service
- As a standalone API process for Hub, Indexer (HTTP mode), and clients

## Run locally

```bash
npm run dev:engine
# or after build:
npm run start:engine
```

## Major modules

| Module | Path | Role |
|--------|------|------|
| Analyzer | `src/core/analyzer.ts` | Normalize, tokenize, stem |
| BM25 | `src/core/bm25.ts` | Keyword ranking |
| Inverted index | `src/core/inverted-index.ts` | Postings, filters, facets, geo filter hook |
| Vector store | `src/core/vector-store.ts` | Embeddings + cosine similarity |
| Hybrid | `src/core/hybrid.ts` | Score blending |
| Geo | `src/core/geo.ts` | Haversine, bbox, point parsing |
| Engine | `src/core/engine.ts` | Orchestration, flush, search modes |
| Storage | `src/storage/*` | memory, filesystem, S3, Redis, DynamoDB, MongoDB |
| API | `src/api/server.ts` | HTTP routes, auth, rate limit, messages |
| Messaging | `src/messaging/vaakly.ts` | User messages + log templates |
| Lambda | `src/api/lambda.ts` | Optional API Gateway inject adapter |

## Field types

| Type | Use |
|------|-----|
| `text` | Full-text (analyzed) |
| `keyword` | Exact match / facets |
| `number` / `boolean` / `date` | Filters & range |
| `vector` | Via doc `vector` + `settings.vectorDimensions` |
| `geo_point` | Location (`{lat,lon}`, `[lon,lat]`, `"lat,lon"`) |

## Search modes

See [Search modes]({{ '/guides/search/' | relative_url }}) and [Geo]({{ '/guides/geo/' | relative_url }}).

| Mode | Needs |
|------|--------|
| `keyword` | `q` |
| `semantic` | `vector` + index `vectorDimensions` |
| `hybrid` | `q` + `vector` |
| `geo` | `geo` object (origin / distance / bbox) |

## Persistence

Indexes are **JSON snapshots** flushed through a [storage adapter]({{ '/guides/storage/' | relative_url }}). Local default: `.anvesh/data/*.anvesh.json`.

## Security

- Optional `ANVESH_API_KEY` (Bearer or `x-api-key`) on `/v1/*`
- Rate limiting, CORS, security headers
- Zod validation on write/search bodies
- Meaningful errors without leaking stack traces to clients

## API and library

- [HTTP API]({{ '/api/http/' | relative_url }})
- [Library API]({{ '/api/library/' | relative_url }})

## Scripts

| Command | Action |
|---------|--------|
| `npm run dev -w @vaagatech/anvesh-engine` | Hot reload serve |
| `npm run test -w @vaagatech/anvesh-engine` | Vitest |
| `npm run example -w @vaagatech/anvesh-engine` | Library quickstart |
