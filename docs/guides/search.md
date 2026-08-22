---
title: Search modes
section: Guides
description: Keyword, semantic, hybrid, and geo ranking in the engine.
permalink: /guides/search/
---

## Modes at a glance

| Mode | Input | Ranking |
|------|-------|---------|
| `keyword` | `q` | BM25 over analyzed text/keyword fields |
| `semantic` | `vector` | Cosine similarity vs stored embeddings |
| `hybrid` | `q` + `vector` | Min-max normalize each, blend with `hybridKeywordWeight` |
| `geo` | `geo` | Distance / bbox filter; optional distance sort |

Mode is auto-detected when omitted:

- only `geo` → `geo`
- `vector` without `q` → `semantic`
- `q` + `vector` → `hybrid`
- otherwise → `keyword`

## Keyword

```json
{
  "q": "lightweight search",
  "fields": ["title", "body"],
  "highlight": true,
  "filters": [{ "field": "tags", "value": "oss" }],
  "from": 0,
  "size": 10
}
```

## Fuzzy, phrase, and prefix

Typos and match style options:

| Option | Effect |
|--------|--------|
| `fuzziness: "AUTO"` | Adaptive distance: 0 edits for ≤2 chars, 1 for ≤5, else 2 |
| `fuzziness: 0 \| 1 \| 2` | Fixed edit distance |
| `phrase: true` | Ordered term match |
| `phraseSlop: 2` | Allowed gaps between phrase terms (0–10) |
| `prefix: true` | Prefix match each query token |

```json
{
  "q": "lightweght serch",
  "fuzziness": "AUTO",
  "fields": ["title", "body"]
}
```

```json
{
  "q": "control plane",
  "phrase": true,
  "phraseSlop": 1
}
```

Query tokens may use trailing `*` or single-char `?` wildcards at the term level.

Fuzzy expansion is capped by the circuit breaker (`ANVESH_MAX_FUZZY_CANDIDATES`); oversize requests return header `x-anvesh-fuzzy-capped: 1`.

## Field boosts and bool subset

Per-field score multipliers:

```json
{ "q": "anvesh hub", "fields": ["title", "body"], "boosts": { "title": 3 } }
```

Flat bool filters (term values only — not full Query DSL):

```json
{
  "q": "search",
  "must": [{ "field": "tags", "value": "oss" }],
  "should": [{ "field": "category", "value": "guide" }],
  "mustNot": [{ "field": "status", "value": "draft" }]
}
```

## Deep pagination (`search_after`)

For results beyond `from + size ≤ ANVESH_MAX_RESULT_WINDOW` (default 10 000), pass the last hit's document id:

```json
{ "q": "articles", "size": 50, "searchAfter": "doc-id-from-previous-page" }
```

When `searchAfter` is set, `from` is ignored. Sort order follows score then id.

## Suggest

Prefix completions from the inverted term dictionary:

```bash
curl -s http://127.0.0.1:3848/v1/indexes/demo/suggest \
  -H 'content-type: application/json' \
  -d '{"prefix":"ligh","field":"title","size":5}'
```

Response: `{ "ok": true, "suggestions": ["lightweight", …] }`

## Stats and histogram facets

Pass special facet kinds alongside field names:

```json
{
  "q": "coffee",
  "facets": ["category", "stats:price", "histogram:price:10"]
}
```

- `stats:field` — count, min, max, avg, sum on numeric fields
- `histogram:field:interval` — fixed-width numeric buckets

Terms facets (`"facets": ["category"]`) behave as before.

## Semantic

Index with `settings.vectorDimensions` and pass embeddings on documents and queries (bring your own model).

```json
{
  "mode": "semantic",
  "vector": [0.12, 0.05, -0.33]
}
```

## Hybrid

```json
{
  "mode": "hybrid",
  "q": "running shoes",
  "vector": [0.9, 0.1, 0.0]
}
```

Tune with index setting `hybridKeywordWeight` (0–1, default 0.5).

## Filters & facets

- **Term filter:** `{ "field": "category", "value": "cafe" }`
- **Range filter:** `{ "field": "price", "gte": 10, "lte": 100 }`
- **Facets:** `"facets": ["category"]` on search body

## Combining with geo

Any mode can include a `geo` object to restrict candidates (and attach `distanceKm` when `origin` is set). See [Geo search]({{ '/guides/geo/' | relative_url }}).

## Field projections & selection

Control which fields are returned in hit sources to save network bandwidth and payload size.

### 1. Projection objects (inclusion & exclusion)
```json
{
  "q": "running shoes",
  "projection": { "title": 1, "price": 1, "meta.brand": 1 }
}
```

Exclusion syntax:
```json
{
  "q": "running shoes",
  "projection": { "body": 0, "rawHtml": 0 }
}
```

Document ID suppression:
```json
{
  "q": "running shoes",
  "projection": { "title": 1, "id": 0 }
}
```

### 2. Array and list shortcuts
```json
{
  "q": "running shoes",
  "select": ["title", "price", "meta.brand"]
}
```

### 3. Source filtering (`_source`)
```json
{
  "q": "running shoes",
  "_source": {
    "includes": ["title*", "meta.*"],
    "excludes": ["internal_*"]
  }
}
```

Or omit source completely (returning only hit metadata & scores):
```json
{
  "q": "running shoes",
  "_source": false
}
```

### 4. GET query parameter selection
```bash
curl "http://127.0.0.1:3848/v1/indexes/products/search?q=shoes&select=title,price"
curl "http://127.0.0.1:3848/v1/indexes/products/documents/123?select=title,price"
```

## Response shape

```json
{
  "ok": true,
  "code": "OK_SEARCH",
  "message": "Search completed. Found 3 matching documents in 1.2ms.",
  "tookMs": 1.2,
  "total": 3,
  "hits": [
    {
      "id": "1",
      "score": 2.1,
      "source": { "id": "1", "fields": { "title": "Red running shoes", "price": 89 } },
      "highlight": { "body": ["…"] },
      "distanceKm": 1.4
    }
  ]
}
```
