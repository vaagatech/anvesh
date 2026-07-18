---
title: Deploy
section: Ship
description: Local Node, containers, ECS, EKS — Lambda only as an optional example.
permalink: /deploy/
---

## Local (default)

No Docker. Filesystem storage:

```bash
npm run dev:engine
```

See [Getting started]({{ '/getting-started/' | relative_url }}).

## Containers (optional)

Same image/command everywhere: `node dist/cli.js serve` inside `apps/engine`.

Manifests live in the repo (not required for local work):

| Target | Path |
|--------|------|
| Compose | `docker-compose.yml` |
| Kubernetes / EKS | `deploy/kubernetes/` |
| ECS Fargate | `deploy/ecs/` |
| Lambda example | `template.yaml` |

Full notes: repository `deploy/README.md`.

## Multi-replica

Use shared storage (`redis` / `s3` / `dynamodb` / `mongodb`) and put a load balancer in front of engine replicas. Keep spider/indexer as Jobs or one-off tasks.

## Health probes

| Probe | Path |
|-------|------|
| Liveness | `GET /health` |
| Readiness | `GET /ready` |

## Indexing workers

```bash
node apps/spider/dist/cli.js --config spider.config.json
node apps/indexer/dist/cli.js --index web --input out.jsonl --engine-url https://search.internal
```
