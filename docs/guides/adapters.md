---
title: Search adapters
section: Guides
description: Register Elasticsearch, OpenSearch, or Solr in Hub and use @vaagatech/anvesh-search-adapters from your own code.
permalink: /guides/adapters/
---

Anvesh ships a thin adapter layer so Hub (and your apps) can talk to **native Anvesh**, **Elasticsearch**, **OpenSearch**, or **Solr** with one query shape.

Package: `@vaagatech/anvesh-search-adapters` · Source: `packages/search-adapters`

For when to pick each backend see [Comparison with Elasticsearch]({{ '/guides/comparison/' | relative_url }}).

## Register in Hub

1. Sign in to Hub as **admin**
2. **Instances** → **Add instance**
3. Set **kind** to `elasticsearch`, `opensearch`, or `solr`
4. **Base URL** — cluster root, no trailing slash:
   - Elasticsearch / OpenSearch: `https://es.example.com:9200`
   - Solr: `http://solr.example.com:8983/solr` (collection name comes from index name at query time)
5. **API key** (optional) — stored encrypted when `ANVESH_SECURE=1`
6. Enable the instance

Hub uses the adapter for **index list**, **search**, and **bulk** on that instance. Native engine instances use kind `engine` (auto-seeded as `local-engine` after `npm start`).

## Use from code

```ts
import { createSearchBackend, ERR_ADAPTER_UNSUPPORTED } from "@vaagatech/anvesh-search-adapters";

const backend = createSearchBackend({
  kind: "elasticsearch", // or "opensearch" | "solr" | "anvesh"
  baseUrl: "https://es.example.com:9200",
  apiKey: process.env.ES_API_KEY,
});

if (await backend.health()) {
  const indexes = await backend.listIndexes();
  const result = await backend.search("articles", {
    q: "lightweight search",
    fields: ["title", "body"],
    fuzziness: "AUTO",
    filters: [{ field: "tags", value: "oss" }],
  });
}
```

### Backend mapping

| Adapter kind | Health | Search | Bulk |
|--------------|--------|--------|------|
| `anvesh` | `GET /health` | `POST /v1/indexes/:name/search` | `POST /v1/indexes/:name/documents/_bulk` |
| `elasticsearch` / `opensearch` | `GET /_cluster/health` or `/` | `POST /:index/_search` | `POST /_bulk` (NDJSON) |
| `solr` | `GET /admin/ping` | `GET /:core/select` (edismax) | `POST /:core/update/json` |

OpenSearch uses the same Elasticsearch mapper (`kind: "opensearch"`).

## Supported Anvesh query subset

Adapters accept `AnveshSearchQuery` — a flat JSON shape shared with the native engine:

| Field | ES/OS | Solr |
|-------|-------|------|
| `q` + `fields[]` | `multi_match` / `match_phrase` | edismax `q` + `qf` |
| `fuzziness` (`AUTO` / 0 / 1 / 2) | `multi_match.fuzziness` | `q~N` |
| `phrase` + `phraseSlop` | `match_phrase` / `multi_match` type phrase | quoted `q` |
| `prefix` | `prefix` query | trailing `*` |
| `boosts` | field `^boost` in `multi_match` | `qf` boosts |
| `filters` (term / range) | `bool.filter` | `fq` |
| `must` / `should` / `mustNot` | `bool` clauses | **unsupported** on Solr |
| `from` / `size` | standard | `start` / `rows` |

**Not supported via adapters** (use native Anvesh engine instead):

- `mode`: `semantic`, `hybrid`, `geo`
- `vector` queries
- Native-only APIs: suggest, aliases, update-by-query, stats/histogram facets

Attempting these against ES/OS/Solr throws **`ERR_ADAPTER_UNSUPPORTED`** before the remote call.

## Unsupported errors

When a query field cannot be mapped, adapters throw `AdapterUnsupportedError`:

```json
{
  "ok": false,
  "code": "ERR_ADAPTER_UNSUPPORTED",
  "message": "vector search is not supported by the elasticsearch adapter"
}
```

Hub surfaces this in Search and job panels — fix the query, switch to native Anvesh, or use the backend's native API directly.

Catch in application code:

```ts
import { ERR_ADAPTER_UNSUPPORTED } from "@vaagatech/anvesh-search-adapters";

try {
  await backend.search("core", { vector: [0.1], mode: "semantic" });
} catch (err) {
  if ((err as { code?: string }).code === ERR_ADAPTER_UNSUPPORTED) {
    // pick another backend or trim the query
  }
}
```

## Index mappings

`createIndex` maps Anvesh field types to Elasticsearch types (`text`, `keyword`, `long`, `date`, `geo_point`, etc.). Solr cores can be created via the adapter's admin API when the cluster allows it; many deployments pre-provision cores instead.

## Next

- [Operator guide]({{ '/operator-guide/' | relative_url }}) — register instances in context
- [Comparison with Elasticsearch]({{ '/comparison/' | relative_url }})
- [HTTP API]({{ '/api/http/' | relative_url }}) — native engine endpoints
