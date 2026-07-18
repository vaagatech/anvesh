---
title: Shared
section: Components
description: Shared types and Zod schemas for spider and indexer.
permalink: /components/shared/
---

## Purpose

**Shared** holds contracts used across crawl and index pipelines so spider output and indexer input stay compatible.

Path: `packages/shared` · Package: `@vaagatech/anvesh-shared`

## Exports

| Export | Kind | Use |
|--------|------|-----|
| `crawlRoleSchema` / `CrawlRole` | Zod + type | Role auth config |
| `spiderConfigSchema` / `SpiderConfig` | Zod + type | Full spider config |
| `CrawledPage` | Interface | One crawled document |
| `IndexDocumentPayload` | Interface | Engine-oriented document |
| `crawledPageToDocument()` | Function | Map page → index payload |
| `INDEXER_DEFAULT_BATCH` | Constant | Default bulk size (50) |

## `crawledPageToDocument`

Maps a page into engine fields:

| Field | Source |
|-------|--------|
| `id` | `finalUrl` |
| `title` / `body` / `url` / `description` | page |
| `roles` | space-joined role names (text) |
| `status` | HTTP status |
| `meta.source` | `"spider"` |
| `meta.roles` / `links` / `depth` / `fetchedAt` | metadata |

## Consumers

- Spider validates config with `spiderConfigSchema`
- Indexer detects `CrawledPage` shapes and maps them automatically
- Engine does **not** depend on shared (keeps search core lean)

## Build

```bash
npm run build -w @vaagatech/anvesh-shared
```

Must build **before** indexer/spider in publish and monorepo builds.
