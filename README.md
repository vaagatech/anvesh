# Anvesh

[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://vaagatech.github.io/anvesh-monorepo/)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

**Lightweight search stack in Node.js** — engine, hub (RBAC control plane), indexer, spider, and setup — by [VaagaTech](https://www.vaagatech.com).

**Docs:** [vaagatech.github.io/anvesh-monorepo](https://vaagatech.github.io/anvesh-monorepo/) · enable Pages from `/docs` ([guide](./docs/github-pages.md))

| Package | Role |
|---------|------|
| `@vaagatech/anvesh-engine` | Search API (BM25, vectors, geo) |
| `@vaagatech/anvesh-hub` | Control plane + modern UI (RBAC, multi-instance) |
| `@vaagatech/anvesh-indexer` | Bulk indexer (+ `serve` worker) |
| `@vaagatech/anvesh-spider` | Site crawler (+ `serve` worker, role-based login) |
| `@vaagatech/anvesh-setup` | Easy local installer |
| `@vaagatech/anvesh-shared` | Shared contracts |

## Easy local setup

```bash
npm install
npm run build
npm run setup -- init
set -a; source .env.anvesh; set +a

# terminals
npm run start:engine          # :3848
npm run start -w @vaagatech/anvesh-hub          # :3849  Hub UI + API
npm run start -w @vaagatech/anvesh-spider -- serve   # :3851
npm run start -w @vaagatech/anvesh-indexer -- serve  # :3852
```

Sign in to Hub (`admin` / password from `.env.anvesh`). Register instance URLs, manage indexes, spider/indexer configs, and users.

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
