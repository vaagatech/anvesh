# Anvesh

[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://vaagatech.github.io/anvesh/)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

**Lightweight search stack in Node.js** — engine, hub (RBAC control plane), indexer, spider, and setup — by [VaagaTech](https://www.vaagatech.com).

**Docs:** [vaagatech.github.io/anvesh](https://vaagatech.github.io/anvesh/) · enable Pages from `/docs` ([guide](./docs/github-pages.md))

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
2. Create a GitHub Release **or** run workflow **Publish npm packages** manually
3. Packages publish in dependency order (includes Hub + Setup)

Manual: `npm run publish:packages`

## License

MIT © [VaagaTech](https://www.vaagatech.com)
