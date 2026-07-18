---
title: Publish to npm
section: Ship
description: Publish all Anvesh packages including Hub and Setup under @vaagatech.
permalink: /publishing/
---

The monorepo root is **private**. All apps below are published.

## Packages

| Package | Name |
|---------|------|
| Shared | `@vaagatech/anvesh-shared` |
| Engine | `@vaagatech/anvesh-engine` |
| Indexer | `@vaagatech/anvesh-indexer` |
| Spider | `@vaagatech/anvesh-spider` |
| Hub | `@vaagatech/anvesh-hub` |
| Setup | `@vaagatech/anvesh-setup` |

Order: **shared → engine → indexer → spider → hub → setup**.

## GitHub Actions

Workflow: `.github/workflows/publish.yml`

- Triggers: `workflow_dispatch` and GitHub Release published
- Requires repo secret **`NPM_TOKEN`** (classic or granular publish token for `@vaagatech`)
- Uses OIDC permission `id-token: write` so you can later switch to npm Trusted Publishing

## Manual publish

```bash
npm login
npm install
npm test
npm run build
npm run publish:dry
npm run publish:packages
```

## Afterward

```bash
npm install -g @vaagatech/anvesh-setup @vaagatech/anvesh-hub
anvesh-setup init
```
