# Anvesh Hub

Control plane for the Anvesh search stack — by [VaagaTech](https://www.vaagatech.com).

```bash
npx @vaagatech/anvesh-hub
# → http://127.0.0.1:3849
```

## Capabilities

- **Instances** — register and edit engine / spider / indexer URLs
- **Indexes** — create, inspect mappings, delete (engine-backed)
- **Documents** — paste or import JSON/JSONL with schema validation before ingest
- **Search** — keyword, semantic, hybrid, and geo modes
- **Spider / Indexer** — save, edit, run configs; track jobs
- **Jobs** — poll crawl/index job status
- **Audit** — action history
- **RBAC** — admin · operator · viewer

## Theme

UI uses the **Cartographic Console** design language (blueprint grid, ocean teal, Syne + Manrope) with keyboard-friendly drawers, live status regions, and high-contrast focus rings.

## Env

| Variable | Default |
|----------|---------|
| `ANVESH_HUB_PORT` | `3849` |
| `ANVESH_HUB_DATA` | `.anvesh/hub` |
| `ANVESH_HUB_ADMIN_USER` | `admin` |
| `ANVESH_HUB_ADMIN_PASSWORD` | `anvesh-admin-change-me` |
