---
title: Hub
section: Components
description: Publishable control plane with RBAC, jobs, audit, ingest validation, and modern search UI.
permalink: /components/hub/
---

## Purpose

**Hub** (`@vaagatech/anvesh-hub`) is the optional but powerful control plane for Anvesh. When configured, it is the place to:

- Register and **edit** multiple **engine / indexer / spider** instances
- Create and inspect **indexes** (mappings); recreate to change schema
- **Import or paste documents** with JSON schema validation against mappings
- Search with **keyword, semantic, hybrid, and geo** modes
- Store, **edit**, and run **spider** / **indexer** configurations
- Track **jobs** and review **audit** history
- Administer users with **RBAC** (`admin`, `operator`, `viewer`)

## Roles

| Role | Capabilities |
|------|----------------|
| `admin` | Everything, including user management and instance registration |
| `operator` | Indexes, documents, spider/indexer configs & runs, search, jobs, audit |
| `viewer` | Read instances/indexes, search, jobs, audit |

## Ports

| App | Default port |
|-----|--------------|
| Engine | 3848 |
| Hub | 3849 |
| Spider worker | 3851 (`anvesh-spider serve`) |
| Indexer worker | 3852 (`anvesh-indexer serve`) |

## Panel guide

| Panel | Purpose |
|-------|---------|
| **Dashboard** | Fleet health + onboarding checklist; links to next action |
| **Instances** | Register engine, spider, indexer, elasticsearch, opensearch, or solr backends |
| **Indexes** | Create/delete indexes and mappings on chosen engine |
| **Documents** | Paste or upload JSON documents with mapping validation |
| **Search** | Keyword, semantic, hybrid, geo; fuzzy / phrase / prefix toggles; pagination |
| **Crawl** | Configure and run spider jobs (auto-index via indexer worker) |
| **Indexer** | Advanced file-based bulk import configs and runs |
| **Jobs** | Queue, running, completed, failed jobs; cancel and delete |
| **Audit** | Who did what — instance, index, and job changes |
| **Users** | RBAC user admin (admin role only) |
| **Appearance** | Theme, fonts, accent, density, motion (browser localStorage) |

## Appearance

The **Appearance** panel customizes Hub for demos and white-label use:

- **Theme** — Coastal (default), Slate, Ink, Midnight
- **Font pack** — Anvesh, Editorial, Technical
- **Accent color**, **density** (comfortable / compact), **motion** (full / reduced)

Choices apply via CSS variables on `document.documentElement` (`data-theme`, `--accent`, font tokens). No server round-trip — stored per browser in localStorage. Override tokens in custom CSS for deeper branding.

## Pagination

List views (Documents, Search results, Jobs, Audit) use a shared **Prev / Next** pager showing `start–end of total`. Search passes `from` / `size` to the engine; deep pages beyond the result-window cap require `search_after` via API (see [HTTP API]({{ '/api/http/' | relative_url }})).

## Typical flow

1. `npm start` (or `npm start -- --seed`)
2. Sign in → Dashboard checklist
3. Create index (or use `demo`) → Crawl or Documents → Search
4. Watch jobs under **Jobs**
