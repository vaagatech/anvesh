---
title: GitHub Pages setup
section: Ship
description: Host this documentation from the /docs folder — no CI required.
permalink: /github-pages/
---

This documentation site is static Jekyll content under `/docs`. GitHub builds it for you when Pages is enabled — **you do not need GitHub Actions**.

## Enable Pages

1. Push this repository to GitHub (`vaagatech/anvesh-monorepo`).
2. Open **Settings → Pages**.
3. Under **Build and deployment**:
   - **Source:** Deploy from a branch
   - **Branch:** `main` (or your default branch)
   - **Folder:** `/docs`
4. Save.

GitHub will run its built-in Jekyll build on `/docs` and publish the site.

## Live URL

```
https://vaagatech.github.io/anvesh-monorepo/
```

`docs/_config.yml` must match the **repository name**:

```yaml
url: "https://vaagatech.github.io"
baseurl: "/anvesh-monorepo"
```

If you rename the repo, change `baseurl` to `/<repo-name>` or nav links and CSS will 404.

## Common breakage

| Symptom | Cause |
|---------|--------|
| Unstyled page / broken nav | `baseurl` does not match the GitHub Pages path |
| `/anvesh/...` 404s | Old baseurl; site is under `/anvesh-monorepo/` |

## Verify locally (optional)

```bash
# from docs/, if you have Bundler + jekyll
bundle exec jekyll serve --baseurl /anvesh-monorepo
```

## What is included

| Path | Content | Live URL |
|------|---------|----------|
| `docs/index.md` | Overview | `/` |
| `docs/why-anvesh.md` | Pitch, market landscape, fit, recommendation | `/why-anvesh/` |
| `docs/use-cases.md` | Product, docs, crawl, RAG, geo, hybrid backends | `/use-cases/` |
| `docs/getting-started.md` | Local quickstart | `/getting-started/` |
| `docs/demo.md` | Demo walkthrough | `/demo/` |
| `docs/architecture.md` | Collective design | `/architecture/` |
| `docs/operator-guide.md` | Happy path | `/operator-guide/` |
| `docs/components/*` | Engine, Hub, Indexer, Spider, Shared, Setup | `/components/` |
| `docs/guides/*` | Search, geo, storage, crawl, indexing, adapters, plugins | `/guides/` |
| `docs/api/*` | HTTP + library | `/api/` |
| `docs/versioning.md` | Bump, sync, tag, release | `/versioning/` |
| `docs/deploy.md` | Deploy options | `/deploy/` |
| `docs/publishing.md` | npm publish | `/publishing/` |
| `docs/_layouts` + `assets/css` | Site chrome | — |

After Pages deploys from `/docs` on `main`:

- https://vaagatech.github.io/anvesh-monorepo/why-anvesh/
- https://vaagatech.github.io/anvesh-monorepo/use-cases/

## After it is live

```markdown
[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://vaagatech.github.io/anvesh-monorepo/)
```
