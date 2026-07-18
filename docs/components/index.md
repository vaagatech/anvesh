---
title: Components
section: Components
description: Every Anvesh package — what it is, when to use it, and how it connects.
permalink: /components/
---

Anvesh is a **monorepo of cooperating apps**. Use only what you need: many deployments run **engine alone**; crawl pipelines add **spider + indexer**; operators may enable **hub**.

<div class="card-grid">
  <a href="{{ '/components/engine/' | relative_url }}"><strong>Engine</strong><span>Search API &amp; library — BM25, vectors, hybrid, geo.</span></a>
  <a href="{{ '/components/hub/' | relative_url }}"><strong>Hub</strong><span>Optional UI to manage indexes and try search.</span></a>
  <a href="{{ '/components/indexer/' | relative_url }}"><strong>Indexer</strong><span>Bulk-load JSON / spider JSONL into the engine.</span></a>
  <a href="{{ '/components/spider/' | relative_url }}"><strong>Spider</strong><span>Full-site crawl with post-login role passes.</span></a>
  <a href="{{ '/components/shared/' | relative_url }}"><strong>Shared</strong><span>Types &amp; schemas shared by spider and indexer.</span></a>
  <a href="{{ '/components/setup/' | relative_url }}"><strong>Setup</strong><span>Easy local installer / scaffold CLI.</span></a>
</div>

## How they work together

| Scenario | Components |
|----------|------------|
| Embed search in an app | Engine library or HTTP API |
| Operate indexes visually | Engine + Hub |
| Index files / exports | Indexer → Engine |
| Index a website | Spider → Indexer → Engine |
| Role-aware site search | Spider (multi-role) → Indexer → Engine (filter on `roles`) |

## Dependency graph

```
shared
  ↑
  ├── spider
  └── indexer → engine
hub ···············→ engine (HTTP only)
```

- Hub never imports engine code — HTTP only.
- Spider does not call the engine directly — writes JSONL for the indexer (or your own pipeline).
- Indexer can call the engine in-process or over HTTP.

## Versioning

Published packages share a version line (e.g. `0.1.0`). Publish order: **shared → engine → indexer → spider**. See [Publishing]({{ '/publishing/' | relative_url }}).
