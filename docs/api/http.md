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
| `message` | Human-readable Vaakly-style sentence |
| `requestId` | On errors (also `x-request-id` header) |

## Endpoints

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness + product metadata |
| `GET` | `/ready` | Storage readiness |

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

### Stats

| Method | Path |
|--------|------|
| `GET` | `/v1/stats` | Index/document counts |

## Status codes

| Code | Typical `code` |
|------|----------------|
| 200 / 201 | `OK_*` |
| 400 | `ERR_VALIDATION`, `ERR_EMPTY_QUERY`, `ERR_VECTOR_DIM` |
| 401 | `ERR_UNAUTHORIZED` |
| 404 | `ERR_INDEX_NOT_FOUND`, `ERR_DOC_NOT_FOUND` |
| 409 | `ERR_INDEX_EXISTS` |
| 429 | `ERR_RATE_LIMIT` |
| 503 | `ERR_STORAGE` |
| 500 | `ERR_INTERNAL` |
