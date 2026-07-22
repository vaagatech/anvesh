---
title: Publish to npm
section: Ship
description: Tag-only npm publish for Anvesh; snapshot builds on main.
permalink: /publishing/
---

The monorepo root is **private**. All apps below are published with the **same version**.

## Packages

| Package | Name |
|---------|------|
| Shared | `@vaagatech/anvesh-shared` |
| Plugins | `@vaagatech/anvesh-plugins` |
| Vaakly | `@vaagatech/vaakly` |
| Search adapters | `@vaagatech/anvesh-search-adapters` |
| Engine | `@vaagatech/anvesh-engine` |
| Indexer | `@vaagatech/anvesh-indexer` |
| Spider | `@vaagatech/anvesh-spider` |
| Hub | `@vaagatech/anvesh-hub` |
| Setup | `@vaagatech/anvesh-setup` |

Order: **shared → plugins → vaakly → search-adapters → engine → indexer → spider → hub → setup**.

## Version sync & tags

Scripts are built in — see the full guide: [Versioning & releases]({{ '/versioning/' | relative_url }}).

```bash
npm run version:check
npm run version:sync
npm run version:set -- 0.2.0
npm run version:bump -- minor
npm run release              # sync + commit + create tag vX.Y.Z
npm run release -- --push    # also push main + tag
```

## GitHub Actions

| Workflow | Trigger | Behavior |
|----------|---------|----------|
| `snapshot.yml` | push/PR to `main` | Install, test, build — **no publish** |
| `publish.yml` | tag `vX.Y.Z` | Publish to npm, then bump **next minor** on `main` |

Requires repo secret **`NPM_TOKEN`**. CI uses **Node 26** (latest Current) and **npm@latest**.

After a successful publish of `v0.1.0`, Actions commits `0.2.0` on `main` so the next release is ready and you never republish the same version by accident.

## Manual dry-run

```bash
npm login
npm install
npm test
npm run build
npm run publish:dry
```
