# Anvesh

[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://vaagatech.github.io/anvesh/)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

**Lightweight enterprise-grade search engine & vector database in Node.js** — BM25 full-text, multi-metric vector DB (HNSW, SQ8), hybrid RRF scoring, sub-millisecond caching, tiered distributed storage (DFS + OCI object store), scatter-gather clustering, built-in telemetry & observability, zero-drop Dead-Letter Queue (DLQ), automated web crawler (Spider), bulk indexer, and Hub control plane (Cognito RBAC) — by [VaagaTech](https://www.vaagatech.com).

**Documentation:** [vaagatech.github.io/anvesh](https://vaagatech.github.io/anvesh/)

**Explore:** [Product Features](https://vaagatech.github.io/anvesh/features) · [Architecture](https://vaagatech.github.io/anvesh/architecture) · [Market Comparison](https://vaagatech.github.io/anvesh/market-comparison) · [Why Anvesh](https://vaagatech.github.io/anvesh/why-anvesh) · [Interactive Demo](https://vaagatech.github.io/anvesh/demo)

---

## Workspace Packages

| Package | Role |
|---|---|
| `@vaagatech/anvesh-engine` | Search & Vector DB Core (BM25, HNSW, SQ8, RRF, DFS, Geo, DLQ) |
| `@vaagatech/anvesh-hub-api` | Control plane Fastify backend + Cognito JWT Authorizer |
| `@vaagatech/anvesh-hub-ui` | Modern React 19 Hub UI (Redesigned Theme, Live Observability, Search Studio) |
| `@vaagatech/anvesh-spider` | Automated web crawler worker with role-based auth & auto-indexing |
| `@vaagatech/anvesh-indexer` | High-throughput bulk stream ingestion worker |
| `@vaagatech/anvesh-setup` | Zero-configuration local cluster installer |
| `@vaagatech/anvesh-shared` | Shared TypeScript schemas, contracts & telemetry types |
| `@vaagatech/anvesh-plugins` | Extensible plugin runtime host |

---

## Key Capabilities

- ⚡ **Hybrid Search & Vector Retrieval**: BM25 inverted index combined with dense vector semantic search using Reciprocal Rank Fusion (RRF) and cosine / euclidean / dot product distance.
- 📉 **SQ8 Vector Quantization**: 8-bit scalar quantization reducing vector RAM footprint by 75% with >98% recall accuracy.
- 💾 **Tiered Storage & OCI Object Store**: Hot in-memory segments, warm local SSD storage, and cold cloud object storage tiering with immutable segment blocks.
- 🛡️ **Zero-Drop Dead-Letter Queue (DLQ)**: Isolated persistence for corrupted or malformed documents with automated retry policies and one-click replay into search indices.
- 📊 **Embedded Observability & Live Telemetry**: Real-time QPS charts, latency percentiles (p50, p95, p99), memory breakdown (RSS, Heap, Segments), and distributed node health tracking.
- 🕷️ **Automated Web Crawler (Spider)**: Configurable multi-worker site crawler with automatic schema detection, depth control, and instant vector embedding.
- 🔐 **Hub Control Plane & RBAC**: Centralized management with AWS Cognito JWT authentication, multi-cluster federation, and role-based permissions (`admin`, `operator`, `viewer`).

---

## Quickstart

### 1. Install & Launch All Services
```bash
npm install
npm start                 # build → init → engine + hub + spider + indexer
```

Optional: Seed with sample demo corpus:
```bash
npm start -- --seed       # starts cluster and seeds "demo" index
```

### 2. Access the Hub UI
Open **[http://127.0.0.1:3849](http://127.0.0.1:3849)** in your browser.
Default credentials will be displayed in the terminal and stored in `.env.anvesh`.

### 3. Stop Cluster
```bash
npm run stop
```

---

## Cloud Deployment (Kubernetes / OCI / AWS)

Anvesh is built for cloud-native deployment with Kubernetes manifests and Terraform templates included in `/infra`:

```bash
# Deploy to Kubernetes cluster
kubectl apply -f infra/k8s/anvesh-k8s.yaml

# Provision AWS API Gateway & Cognito User Pool
cd infra/terraform && terraform apply
```

See the [Deployment Guide](https://vaagatech.github.io/anvesh/deploy) for detailed production setup instructions.

---

## License

MIT © [VaagaTech](https://www.vaagatech.com)
