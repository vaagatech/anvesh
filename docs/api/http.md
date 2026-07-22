---
title: HTTP API
section: Guides
description: REST endpoints for indexes, documents, and search.
permalink: /api/http/
---

Base URL (local): `http://127.0.0.1:3848`

All `/v1/*` routes may require `Authorization: Bearer <ANVESH_API_KEY>` or `x-api-key` when the key is configured. `/health` and `/ready` stay public.

## Envelope

Success and error bodies include:

| Field | Meaning |
|-------|---------|
| `ok` | boolean |
| `code` | Stable machine code (`OK_SEARCH`, `ERR_VALIDATION`, …) |
| `message` | Human-readable summary (Vaakly-corrected) |
| `requestId` | On errors (also `x-request-id` header) |

## Endpoints

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness + product metadata |
| `GET` | `/ready` | Storage readiness |

### Plugins

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/plugins` | List plugins + tools |
| `GET` | `/v1/plugins/tools` | Flat LLM-style tool catalog |
| `POST` | `/v1/plugins/invoke` | Invoke a tool (`{ name, arguments }`) |

Default plugin: **vaakly** (summary correction). See [Plugins]({{ '/guides/plugins/' | relative_url }}).

### Indexes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/indexes` | List indexes |
| `POST` | `/v1/indexes` | Create index |
| `GET` | `/v1/indexes/:name` | Get definition |
| `DELETE` | `/v1/indexes/:name` | Delete index + docs |

**Create body**

```json
{
  "name": "articles",
  "mappings": {
    "title": { "type": "text" },
    "body": { "type": "text" },
    "tags": { "type": "keyword" },
    "location": { "type": "geo_point" }
  },
  "settings": {
    "vectorDimensions": 384,
    "hybridKeywordWeight": 0.5,
    "bm25k1": 1.2,
    "bm25b": 0.75
  }
}
```

### Documents

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/indexes/:name/documents` | Index (auto id if omitted) |
| `PUT` | `/v1/indexes/:name/documents/:id` | Upsert by id |
| `GET` | `/v1/indexes/:name/documents/:id` | Get stored doc |
| `DELETE` | `/v1/indexes/:name/documents/:id` | Delete |
| `POST` | `/v1/indexes/:name/documents/_bulk` | Bulk upsert |

**Document body**

```json
{
  "id": "optional-id",
  "fields": { "title": "Hello", "body": "…" },
  "vector": [0.1, 0.2],
  "meta": { "source": "api" }
}
```

**Bulk body**

```json
{
  "documents": [ { "id": "1", "fields": { "title": "A" } } ]
}
```

Max 1000 documents per bulk request.

### Search

| Method | Path |
|--------|------|
| `POST` | `/v1/indexes/:name/search` |

See [Search modes]({{ '/guides/search/' | relative_url }}) and [Geo]({{ '/guides/geo/' | relative_url }}).

**Search body extras**

| Field | Type | Notes |
|-------|------|-------|
| `fuzziness` | `false` / `0` / `1` / `2` / `"AUTO"` | Edit distance; default off |
| `phrase` | boolean | Ordered term match |
| `phraseSlop` | 0–10 | Gap allowance when `phrase: true` |
| `prefix` | boolean | Prefix each token |
| `boosts` | `{ field: number }` | Per-field score multiplier |
| `must` / `should` / `mustNot` | term arrays | Flat bool subset |
| `searchAfter` | string | Document id cursor (deep pagination) |

Circuit trips on search may return `circuits` stats in the error body. Fuzzy cap sets response header `x-anvesh-fuzzy-capped: 1`.

### Suggest

| Method | Path |
|--------|------|
| `POST` | `/v1/indexes/:name/suggest` |

```json
{ "prefix": "ligh", "field": "title", "size": 10 }
```

### Update by query

| Method | Path |
|--------|------|
| `POST` | `/v1/indexes/:name/update-by-query` |

Set fields on documents matching optional filters (no scripts). Batched; respects memory circuit.

```json
{
  "filters": [{ "field": "tags", "value": "draft" }],
  "set": { "status": "published" },
  "maxDocs": 500
}
```

### Aliases

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/aliases` | List alias → index map |
| `PUT` | `/v1/aliases/:alias` | Body: `{ "index": "target-index" }` |
| `DELETE` | `/v1/aliases/:alias` | Remove alias |

Search and document routes resolve aliases to target indexes.

### Stats

| Method | Path |
|--------|------|
| `GET` | `/v1/stats` | Index/document counts **and circuit breaker state** |

Response includes `circuits`: in-flight searches, limits, tripped counters, and RSS MB. `/health` also embeds `circuits`.

## Circuit breaker responses

| HTTP | Code | Cause |
|------|------|-------|
| 413 | `ERR_CIRCUIT_BODY` | Request body &gt; `ANVESH_MAX_BODY_BYTES` |
| 400 | `ERR_CIRCUIT_BULK` | Bulk batch &gt; `ANVESH_MAX_BULK_DOCS` |
| 400 | `ERR_CIRCUIT_RESULT_WINDOW` | `from + size` &gt; `ANVESH_MAX_RESULT_WINDOW` |
| 429 | `ERR_CIRCUIT_CONCURRENT` | Too many in-flight searches |
| 429 | `ERR_CIRCUIT_MEMORY` | RSS &gt; `ANVESH_MAX_RSS_MB` |
| 429 | `ERR_CIRCUIT_DOCS` | Index would exceed `ANVESH_MAX_DOCS_PER_INDEX` |

Error bodies include `circuits` snapshot when a circuit trips. See [SECURITY.md](https://github.com/vaagatech/anvesh-monorepo/blob/main/SECURITY.md) for env vars.

## Status codes

| Code | Typical `code` |
|------|----------------|
| 200 / 201 | `OK_*` |
| 400 | `ERR_VALIDATION`, `ERR_EMPTY_QUERY`, `ERR_VECTOR_DIM` |
| 401 | `ERR_UNAUTHORIZED` |
| 404 | `ERR_INDEX_NOT_FOUND`, `ERR_DOC_NOT_FOUND` |
| 409 | `ERR_INDEX_EXISTS` |
| 429 | `ERR_RATE_LIMIT`, `ERR_CIRCUIT_*` |
| 503 | `ERR_STORAGE` |
| 500 | `ERR_INTERNAL` |
