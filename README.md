# Anvesh

[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://vaagatech.github.io/anvesh-monorepo/)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

**Lightweight search stack in Node.js** — engine, hub (RBAC control plane), indexer, spider, and setup — by [VaagaTech](https://www.vaagatech.com).

**Docs:** [vaagatech.github.io/anvesh-monorepo](https://vaagatech.github.io/anvesh-monorepo/) · enable Pages from `/docs` ([guide](./docs/github-pages.md))

**Start here:** [Why Anvesh](./docs/why-anvesh.md) · [Use cases](./docs/use-cases.md) · [Versioning](./docs/versioning.md)

| Package | Role |
|---------|------|
| `@vaagatech/anvesh-engine` | Search API (BM25, vectors, geo) |
| `@vaagatech/anvesh-hub` | Control plane + modern UI (RBAC, multi-instance) |
| `@vaagatech/anvesh-indexer` | Bulk indexer (+ `serve` worker) |
| `@vaagatech/anvesh-spider` | Site crawler (+ `serve` worker, role-based login) |
| `@vaagatech/anvesh-setup` | Easy local installer |
| `@vaagatech/anvesh-shared` | Shared contracts |
| `@vaagatech/anvesh-plugins` | Plugin host (LLM-tool style) |
| `@vaagatech/vaakly` | API summary messaging plugin |

## Easy local setup

```bash
npm install
npm start                 # build (if needed) → init → engine + hub + spider + indexer
```

Optional demo corpus:

```bash
npm start -- --seed       # same as above, then seed index "demo"
```

Open Hub at http://127.0.0.1:3849 (`admin` / password printed by the script, also in `.env.anvesh`). Local instances are registered automatically.

**Operator guide:** [docs/operator-guide.md](./docs/operator-guide.md) · published at [vaagatech.github.io/anvesh-monorepo/operator-guide](https://vaagatech.github.io/anvesh-monorepo/operator-guide/)

Stop with `npm run stop`.

Try-it on Pages: [vaagatech.github.io/anvesh-monorepo/demo](https://vaagatech.github.io/anvesh-monorepo/demo/) (set Engine URL to a seeded public API, or use `http://127.0.0.1:3848` when testing locally with CORS).

## Hub as control plane

When configured, Hub manages:

- Multiple **engine / spider / indexer** instances
- Index create/delete/mappings on chosen engines
- Spider & indexer configuration + job runs
- RBAC: **admin** · **operator** · **viewer**

## Publish (GitHub Actions)

1. Add repo secret `NPM_TOKEN`
2. On `main`, set the version you want to ship (all packages stay in sync):
   ```bash
   npm run version:set -- 0.1.0
   npm run release -- --push   # commit + tag v0.1.0 + push
   ```
3. Tag `vX.Y.Z` triggers publish; then CI bumps **next minor** on `main` (e.g. `0.2.0`)
4. Pushes to `main` only run a **snapshot** build (test + build, no npm publish)

## License

MIT © [VaagaTech](https://www.vaagatech.com)
