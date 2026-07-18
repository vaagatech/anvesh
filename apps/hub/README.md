# Anvesh Hub

Publishable control plane for the Anvesh stack (`@vaagatech/anvesh-hub`).

## What Hub controls

- **RBAC** — `admin` / `operator` / `viewer`
- **Instances** — register multiple engine, indexer, and spider URLs
- **Indexes** — create/list/delete on any engine instance
- **Spider configs** — store role-based crawl configs and run jobs
- **Indexer configs** — store bulk jobs and run against indexer workers
- **Search** — try queries through the selected engine

## Run

```bash
npm run build -w @vaagatech/anvesh-hub
ANVESH_HUB_ADMIN_USER=admin ANVESH_HUB_ADMIN_PASSWORD='change-me' npm run start -w @vaagatech/anvesh-hub
# http://127.0.0.1:3849
```

Dev (API only; UI via Vite proxy):

```bash
npm run dev:server -w @vaagatech/anvesh-hub   # :3849
npm run dev:ui -w @vaagatech/anvesh-hub       # :5173 → proxies /hub
```

By [VaagaTech](https://www.vaagatech.com).
