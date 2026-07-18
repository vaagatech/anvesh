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
| Engine | `@vaagatech/anvesh-engine` |
| Indexer | `@vaagatech/anvesh-indexer` |
| Spider | `@vaagatech/anvesh-spider` |
| Hub | `@vaagatech/anvesh-hub` |
| Setup | `@vaagatech/anvesh-setup` |

Order: **shared → engine → indexer → spider → hub → setup**.

## Version sync

Every `package.json` (root, apps, packages) and internal `@vaagatech/anvesh-*` dependency versions must match.

```bash
npm run version:check
npm run version:sync
npm run version:set -- 0.2.0
npm run version:bump -- minor
```

## Release (commit + tag)

Publish happens **only** from a git tag matching `v\d{1,3}.\d{1,3}.\d{1,3}` (e.g. `v0.1.0`).

```bash
# On main, with the version you want to ship already in package.json
npm run release              # sync versions, commit, create tag vX.Y.Z
npm run release -- --push    # also push main + tag (triggers publish)
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
