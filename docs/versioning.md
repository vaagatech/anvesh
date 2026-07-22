---
title: Versioning & releases
section: Ship
description: Bump, sync, check, and tag Anvesh releases with the built-in scripts.
permalink: /versioning/
---

Anvesh uses **one version** across the monorepo. Scripts for bump, sync, check, and tag creation are already in the repo.

## Quick reference

| Command | What it does |
|---------|----------------|
| `npm run version:check` | Fail if any `package.json` version differs |
| `npm run version:sync` | Set every package to the **root** `package.json` version; sync internal `@vaagatech/*` deps |
| `npm run version:set -- 0.3.0` | Set all packages to an explicit version |
| `npm run version:bump -- patch\|minor\|major` | Bump root + all packages (default kind: `minor` if you pass nothing to the script) |
| `npm run release` | Sync → commit → create annotated tag `vX.Y.Z` |
| `npm run release -- --push` | Same, then push `main` + tag |
| `npm run release -- --message "…"` | Custom release commit message |

Scripts live at:

- [`scripts/version.mjs`](https://github.com/vaagatech/anvesh-monorepo/blob/main/scripts/version.mjs) — check / sync / set / bump / from-tag  
- [`scripts/release.sh`](https://github.com/vaagatech/anvesh-monorepo/blob/main/scripts/release.sh) — commit + **create tag**

## Typical release flow

```bash
# 1. Decide the next version
npm run version:bump -- minor    # e.g. 0.2.0 → 0.3.0

# 2. Verify everything matches
npm run version:check

# 3. On main: sync (again), commit, create tag v0.3.0
npm run release

# 4. Publish trigger (optional)
npm run release -- --push        # or: git push origin main && git push origin v0.3.0
```

Tag format: **`vX.Y.Z`** with 1–3 digits per part (e.g. `v0.2.0`, `v1.0.0`).

If the tag already exists, release exits and asks you to bump first.

## What gets synced

- Root `package.json`
- Every `apps/*/package.json` and `packages/*/package.json`
- Internal dependencies named `@vaagatech/anvesh-*` **and** `@vaagatech/vaakly`

## CI

| Workflow | Trigger | Behavior |
|----------|---------|----------|
| Snapshot | push/PR to `main` | test + build — no publish |
| Publish | tag `vX.Y.Z` | npm publish, then bump next minor on `main` |

Details: [Publish to npm]({{ '/publishing/' | relative_url }}).

## from-tag (CI helper)

```bash
node scripts/version.mjs from-tag v0.2.0
```

Checks that all packages are already at `0.2.0` (used when verifying a tag matches the tree).
