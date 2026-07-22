# Anvesh end-to-end tests

Boots an **isolated** local stack (engine / hub / spider / indexer) on ports
`14848–14852`, fixture site `14880`, and mock ES/Solr adapters `14890–14891`.
Does **not** touch your default `.anvesh` / `.env.anvesh`.

## Run

```bash
npm run test:e2e

# already built:
npx vitest run --config e2e/vitest.config.ts

# verbose service logs:
E2E_VERBOSE=1 npm run test:e2e
```

## Suites

| File | Coverage |
|------|----------|
| `01-health-auth` | Health/ready/stats, API keys, login/logout, password change, audit |
| `02-rbac` | Admin / operator / viewer permission matrix, user CRUD |
| `03-instances-docs` | Instance CRUD, index lifecycle, validate/ingest, doc CRUD/clear |
| `04-search` | Keyword/fuzzy/phrase/prefix/wildcards, hybrid/semantic, geo, filters, bool, facets, boosts, highlight, search_after, suggest/aliases/UbQ |
| `05-crawl-jobs` | Spider CRUD+run, path deny, indexer `documents[]`, jobs cancel/delete/clear, direct spider |
| `06-circuits-adapters` | Result window/bulk/doc-cap/concurrent circuits; ES/Solr mock adapters + 501 unsupported |

Appearance (UI-only localStorage) is intentionally out of scope for API e2e.
