---
title: GitHub Pages setup
section: Ship
description: Host this documentation from the /docs folder — no CI required.
permalink: /github-pages/
---

This documentation site is static Jekyll content under `/docs`. GitHub builds it for you when Pages is enabled — **you do not need GitHub Actions**.

## Enable Pages (before or after publishing npm)

1. Push this repository to GitHub (e.g. `vaagatech/anvesh`).
2. Open **Settings → Pages**.
3. Under **Build and deployment**:
   - **Source:** Deploy from a branch
   - **Branch:** `main` (or your default branch)
   - **Folder:** `/docs`
4. Save.

GitHub will run its built-in Jekyll build on `/docs` and publish the site.

## Expected URL

For a project site under the `vaagatech` org/user:

```
https://vaagatech.github.io/anvesh/
```

`docs/_config.yml` already sets:

```yaml
url: "https://vaagatech.github.io"
baseurl: "/anvesh"
```

If your repo name differs, change `baseurl` to `/<repo-name>` and update `url` if needed.

## Verify locally (optional)

```bash
# from docs/, if you have Bundler + jekyll
# gem install bundler jekyll
# bundle exec jekyll serve --baseurl /anvesh
```

Or simply open markdown in the repo — GitHub Pages will render with the custom layout once enabled.

## What is included

| Path | Content |
|------|---------|
| `docs/index.md` | Overview |
| `docs/getting-started.md` | Local quickstart |
| `docs/architecture.md` | Collective design |
| `docs/components/*` | Engine, Hub, Indexer, Spider, Shared |
| `docs/guides/*` | Search, geo, storage, crawl, indexing |
| `docs/api/*` | HTTP + library |
| `docs/deploy.md` | Deploy options |
| `docs/publishing.md` | npm publish |
| `docs/_layouts` + `assets/css` | Site chrome |

## No CI

Do **not** add a Pages workflow unless you want one later. Branch + `/docs` is enough.

## After it is live

Add a badge to the root README:

```markdown
[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://vaagatech.github.io/anvesh/)
```
