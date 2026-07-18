# Anvesh

[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://vaagatech.github.io/anvesh/)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

**Lightweight full-text + semantic + geo search in Node.js** — an open-source monorepo by [VaagaTech](https://www.vaagatech.com).

**Documentation:** [vaagatech.github.io/anvesh](https://vaagatech.github.io/anvesh/) (enable GitHub Pages from `/docs` — [setup guide](./docs/github-pages.md))

| App / package | Purpose |
|---------------|---------|
| [`apps/engine`](./apps/engine) | Search API (BM25, vectors, hybrid, geo) |
| [`apps/hub`](./apps/hub) | Optional management UI |
| [`apps/indexer`](./apps/indexer) | Bulk indexing worker (files / spider JSONL → engine) |
| [`apps/spider`](./apps/spider) | Full-site crawler with **role-based post-login** discovery |
| [`packages/shared`](./packages/shared) | Shared crawl/index contracts |

## Docs map

| Topic | Page |
|-------|------|
| Overview | [docs site](https://vaagatech.github.io/anvesh/) |
| Getting started | [/getting-started](https://vaagatech.github.io/anvesh/getting-started/) |
| Architecture | [/architecture](https://vaagatech.github.io/anvesh/architecture/) |
| Engine / Hub / Indexer / Spider / Shared | [/components](https://vaagatech.github.io/anvesh/components/) |
| HTTP API | [/api/http](https://vaagatech.github.io/anvesh/api/http/) |
| Publish to npm | [/publishing](https://vaagatech.github.io/anvesh/publishing/) |
| Enable Pages (no CI) | [docs/github-pages.md](./docs/github-pages.md) |

Local development uses **plain Node.js + filesystem** — no Docker required.

## Monorepo quick start

```bash
npm install
npm run build
npm run dev:engine          # http://127.0.0.1:3848/health
npm run dev:hub             # optional UI :3849
```

Crawl a site (anonymous), then index:

```bash
npm run start -w @vaagatech/anvesh-spider -- --seed https://example.com --out .anvesh/crawl/out.jsonl
npm run start -w @vaagatech/anvesh-indexer -- --index web --input .anvesh/crawl/out.jsonl
```

Role-based crawl: see [`apps/spider/examples/spider.config.example.json`](./apps/spider/examples/spider.config.example.json) and the [crawling guide](https://vaagatech.github.io/anvesh/guides/crawling/).

## Architecture (summary)

```
  spider ──JSONL──▶ indexer ──▶ engine ◀── hub (optional)
```

Full detail: [Architecture](https://vaagatech.github.io/anvesh/architecture/).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev:engine` | Engine API with hot reload |
| `npm run dev:hub` | Hub UI |
| `npm run build` | Build all workspaces |
| `npm test` | Engine + spider tests |
| `npm run publish:dry` | Preview npm publish |
| `npm run publish:packages` | Publish shared → engine → indexer → spider |

## Deploy & publish

- Deploy: [docs](https://vaagatech.github.io/anvesh/deploy/) · repo [`deploy/`](./deploy/)
- npm: [publishing guide](https://vaagatech.github.io/anvesh/publishing/)

```bash
npm login
npm run build
npm run publish:packages
```

Hub and the monorepo root stay private.

## License

MIT © [VaagaTech](https://www.vaagatech.com)
