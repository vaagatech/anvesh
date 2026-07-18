---
title: Hub
section: Components
description: Publishable control plane with RBAC over engines, indexes, spiders, and indexers.
permalink: /components/hub/
---

## Purpose

**Hub** (`@vaagatech/anvesh-hub`) is the optional but powerful control plane for Anvesh. When configured, it is the place to:

- Register **multiple instances** of engine, indexer, and spider
- Create and manage **indexes** (and mappings) on any engine
- Store and run **spider** configurations (including post-login roles)
- Store and run **indexer** configurations
- Administer users with **RBAC** (`admin`, `operator`, `viewer`)
- Try **search** against a selected engine

The engine, spider, and indexer remain standalone apps. Hub orchestrates them over HTTP.

## Roles

| Role | Capabilities |
|------|----------------|
| `admin` | Everything, including user management and instance registration |
| `operator` | Indexes, spider/indexer configs & runs, search; read instances |
| `viewer` | Read instances/indexes and run search |

## Ports

| App | Default port |
|-----|--------------|
| Engine | 3848 |
| Hub | 3849 |
| Spider worker | 3851 (`anvesh-spider serve`) |
| Indexer worker | 3852 (`anvesh-indexer serve`) |

## Bootstrap

First start creates an admin user:

```bash
ANVESH_HUB_ADMIN_USER=admin
ANVESH_HUB_ADMIN_PASSWORD=change-me
anvesh-hub
```

Or use `anvesh-setup init` which writes `.env.anvesh` with a generated password.

## Typical flow

1. `anvesh-setup init`
2. Start engine, hub, spider serve, indexer serve
3. Sign in to Hub
4. Register instance URLs
5. Create indexes on an engine
6. Save spider/indexer configs and run jobs
7. Search

## Publish

Hub is published to npm with the other packages via GitHub Actions (`.github/workflows/publish.yml`) or `npm run publish:packages`.
