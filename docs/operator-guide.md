---
title: Operator guide
section: Start
description: One happy path from npm start through Hub — indexes, crawl, search, and when to pick native Anvesh vs adapters.
permalink: /operator-guide/
---

This is the lead page for day-to-day Anvesh operations. For install details see [Getting started]({{ '/getting-started/' | relative_url }}); for API reference see [HTTP API]({{ '/api/http/' | relative_url }}).

## 1. Start the stack

```bash
npm install
npm start                 # build (if needed) → init → engine + hub + spider + indexer
```

Optional demo corpus:

```bash
npm start -- --seed       # same as above, then seed index "demo"
```

Stop with `npm run stop`.

| Service | Default port | URL |
|---------|--------------|-----|
| Engine | 3848 | http://127.0.0.1:3848 |
| Hub | 3849 | http://127.0.0.1:3849 |
| Spider worker | 3851 | http://127.0.0.1:3851 |
| Indexer worker | 3852 | http://127.0.0.1:3852 |

After `npm start`, local engine/spider/indexer instances are registered in Hub automatically.

## 2. Login Hub → Dashboard checklist

1. Open [http://127.0.0.1:3849](http://127.0.0.1:3849)
2. Sign in as `admin` (password printed by the start script and stored in `.env.anvesh`)
3. **Dashboard** shows a progress checklist:
   - **Fleet healthy** — engine, spider, and indexer reachable
   - **Create an index** — or skip if you used `--seed` (`demo` index)
   - **Crawl a site** — Spider tab → Run
   - **Search your content** — hybrid search with fuzzy/phrase/prefix toggles

Each step links to the right panel. You do not need to manually register local instances after `npm start`.

## 3. Indexes → create (or use demo)

**Indexes** tab:

- Pick an engine instance (native Anvesh or an external adapter — see below)
- Create an index with mappings, or use the **web** preset (title, body, tags, location, vectors with auto-embed)
- With `--seed`, the `demo` index is ready immediately

To change schema, delete and recreate the index (Anvesh uses explicit mappings).

## 4. Crawl → Run → Jobs

**Crawl** (Spider) tab:

1. Select target index (creates it if missing when using web mappings)
2. Enter seed URL(s), depth/page limits, optional roles
3. **Run** — spider discovers pages; indexer writes them to the engine in memory (no JSONL file step)
4. **Jobs** tab — watch queued/running/completed runs; cancel or delete as needed

For file-based or scripted bulk loads, see [When to ingest](#when-to-ingest-documents-vs-crawl-vs-bulk-import) below.

## 5. Search (hybrid + fuzzy)

**Search** tab:

- Pick engine + index
- Default mode is **hybrid** (BM25 + local embeddings when vectors are configured)
- Toggle **Fuzzy**, **Phrase**, or **Prefix** for typo tolerance, ordered terms, or typeahead-style matches
- Sample query chips exercise exact, paraphrase, and hybrid cases
- Pagination controls appear when results exceed the page size

Equivalent curl:

```bash
curl -s http://127.0.0.1:3848/v1/indexes/demo/search \
  -H 'content-type: application/json' \
  -d '{"q":"lightweght serch","mode":"hybrid","fuzziness":"AUTO","highlight":true}'
```

See [Search modes]({{ '/guides/search/' | relative_url }}) for phrase slop, boosts, bool filters, and deep pagination.

## 6. When to ingest: Documents vs Crawl vs Bulk import

| Path | Best for | Hub panel | Notes |
|------|----------|-----------|-------|
| **Documents** | One-off docs, QA, small fixes | Documents | Paste or upload JSON; validated against mappings |
| **Crawl** | Full-site discovery, post-login pages | Crawl (Spider) | Primary happy path; auto-indexes via indexer worker |
| **Bulk import** | Large JSON/JSONL files, CI pipelines | Indexer (advanced) or CLI | `anvesh-indexer --input file.jsonl`; prefer HTTP mode against live engine |

Rule of thumb: **Crawl** for websites, **Documents** for hand-entered content, **Bulk import** when you already have a file or external ETL job.

## 7. Native Anvesh vs ES / OpenSearch / Solr adapters

| Choose | When |
|--------|------|
| **Native Anvesh engine** | Local-first, hybrid/semantic/geo, Hub crawl pipeline, single-node scale, demos |
| **Elasticsearch / OpenSearch adapter** | Existing cluster, full Query DSL, rich aggregations, cluster scale |
| **Solr adapter** | Existing Solr cores, edismax workflows |

Register external backends under **Instances** → kind `elasticsearch`, `opensearch`, or `solr` → base URL + API key. Hub routes index list, search, and bulk through `@vaagatech/anvesh-search-adapters` using the [Anvesh query subset]({{ '/guides/adapters/' | relative_url }}).

Unsupported features return `ERR_ADAPTER_UNSUPPORTED` — not silent fallback.

See [Comparison with Elasticsearch]({{ '/guides/comparison/' | relative_url }}) for the full feature matrix.

## 8. Appearance + Secure mode

**Appearance** (Hub sidebar): theme preset, font pack, accent color, density, and motion — stored in browser localStorage only. Useful for white-label demos; override CSS variables via `data-theme` for custom branding. Details in [Hub component]({{ '/components/hub/' | relative_url }}).

**Secure mode** (`ANVESH_SECURE=1`, set by default on `anvesh-setup init`):

- Hub encrypts instance API keys at rest (`ANVESH_HUB_SECRETS_KEY`)
- Stronger password minimum (12 chars)
- Never commit `.env.anvesh` — it holds admin password, engine keys, and secrets key

Full checklist: [SECURITY.md](https://github.com/vaagatech/anvesh-monorepo/blob/main/SECURITY.md).

## Next

- [Demo]({{ '/demo/' | relative_url }}) — try-it page + local rehearsal
- [Search adapters]({{ '/guides/adapters/' | relative_url }})
- [HTTP API]({{ '/api/http/' | relative_url }}) — fuzziness, circuit breakers, suggest, aliases
