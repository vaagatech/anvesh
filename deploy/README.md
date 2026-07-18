# Deploying Anvesh

**Local development does not use Docker.** From the monorepo root:

```bash
npm install && npm run build && npm run dev:engine
# indexes → .anvesh/data/
```

Apps: `engine` · `hub` · `indexer` · `spider` — see root README.

```
                    ┌──────────────────────────────┐
   Clients / Hub ──▶│  Anvesh HTTP API (:3848)     │
                    │  node dist/cli.js serve      │
                    └──────────────┬───────────────┘
                                   │ storage
                    ┌──────────────▼───────────────┐
                    │  local: filesystem           │
                    │  multi-replica: Redis/S3/…   │
                    └──────────────────────────────┘
```

Use a **shared storage backend** (Redis, S3, DynamoDB, MongoDB) when you run more than one replica. Filesystem is the local default and is fine for a single replica/PVC.

| Target | Manifests |
|--------|-----------|
| **Local (Node + filesystem)** | `npm run dev` — no Docker |
| Kubernetes / EKS | [`deploy/kubernetes/`](./kubernetes/) |
| ECS Fargate | [`deploy/ecs/`](./ecs/) |
| Docker Compose (optional) | [`docker-compose.yml`](../docker-compose.yml) |
| Lambda (optional) | [`template.yaml`](../template.yaml) |

## Build a container image (optional)

Only when deploying to a container platform:

```bash
docker build -t anvesh:0.1.0 .
```

## Health probes

| Endpoint | Use |
|----------|-----|
| `GET /health` | Liveness — process is up |
| `GET /ready` | Readiness — storage adapter responds |

## Environment

See [`.env.example`](../.env.example). Local minimum is empty — defaults are filesystem + `.anvesh/data`.

For multi-replica production:

```bash
ANVESH_STORAGE=redis
ANVESH_API_KEY=...
ANVESH_PORT=3848
ANVESH_LOG_PRETTY=0
```

## Indexing worker (optional)

Locally (no Docker):

```bash
node dist/cli.js index-file articles ./bulk.json
```

In Kubernetes/ECS, use the same command as a Job/task when bulk loads are heavy.
