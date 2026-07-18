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

## Response shape

```json
{
  "ok": true,
  "code": "OK_SEARCH",
  "message": "Search completed successfully. Found 3 matching document(s) in 1.2ms.",
  "tookMs": 1.2,
  "total": 3,
  "hits": [
    {
      "id": "1",
      "score": 2.1,
      "source": { "id": "1", "fields": { } },
      "highlight": { "body": ["…"] },
      "distanceKm": 1.4
    }
  ]
}
```
