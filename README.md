# Anvesh

[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://vaagatech.github.io/anvesh/)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

**Lightweight enterprise-grade search engine, vector database, and multimodal ingestion platform in Node.js** — BM25 full-text, multi-metric vector DB (HNSW, SQ8), hybrid RRF scoring, semantic synonym expansion, bounded highlighting, non-AI visual/OCR feature extraction, tiered distributed storage (DFS + S3/OCI), scatter-gather clustering, multi-layered concurrency throttling & circuit breakers, zero-drop Dead-Letter Queue (DLQ), automated web crawler (Spider), bulk indexer, official TypeScript SDK, CLI, Terraform Provider, and Hub control plane (Cognito RBAC) — by [VaagaTech](https://www.vaagatech.com).

**Documentation:** [vaagatech.github.io/anvesh](https://vaagatech.github.io/anvesh/)

**Explore:** [Product Features](https://vaagatech.github.io/anvesh/features) · [Architecture](https://vaagatech.github.io/anvesh/architecture) · [Market Comparison](https://vaagatech.github.io/anvesh/market-comparison) · [Why Anvesh](https://vaagatech.github.io/anvesh/why-anvesh) · [Interactive Demo](https://vaagatech.github.io/anvesh/demo)

---

## Workspace Packages

| Package | Role |
|---|---|
| [`@vaagatech/anvesh-engine`](file:///Users/karthiksp/projects/searchengine/apps/engine) | High-throughput Search & Vector DB Core (BM25, HNSW, SQ8, RRF, DFS, Geo, DLQ, Circuits) |
| [`@vaagatech/anvesh-sdk`](file:///Users/karthiksp/projects/searchengine/packages/sdk) | Official TypeScript/JavaScript Client SDK with automatic Cognito M2M token renewal |
| [`@vaagatech/anvesh-cli`](file:///Users/karthiksp/projects/searchengine/packages/cli) | Developer & CI/CD CLI tool (`anvesh init`, `plan`, `apply`, `export`, `search`, `ocr`) |
| [`@vaagatech/anvesh-visual-extractor`](file:///Users/karthiksp/projects/searchengine/packages/visual-extractor) | Non-AI OCR, dominant textile color palette analyzer, and motif/pattern edge descriptor |
| [`terraform-provider-anvesh`](file:///Users/karthiksp/projects/searchengine/packages/terraform-provider-anvesh) | Terraform Provider for declarative Infrastructure-as-Code search engine management |
| [`@vaagatech/anvesh-hub-api`](file:///Users/karthiksp/projects/searchengine/apps/hub-api) | Control plane Fastify backend + Cognito JWT Authorizer |
| [`@vaagatech/anvesh-hub-ui`](file:///Users/karthiksp/projects/searchengine/apps/hub-ui) | Modern React 19 Hub UI (Redesigned Theme, Live Observability, Search Studio) |
| [`@vaagatech/anvesh-spider`](file:///Users/karthiksp/projects/searchengine/apps/spider) | Automated web crawler worker with role-based auth & auto-indexing |
| [`@vaagatech/anvesh-indexer`](file:///Users/karthiksp/projects/searchengine/apps/indexer) | High-throughput bulk stream ingestion worker |
| [`@vaagatech/anvesh-setup`](file:///Users/karthiksp/projects/searchengine/apps/setup) | Zero-configuration local cluster installer |
| [`@vaagatech/anvesh-shared`](file:///Users/karthiksp/projects/searchengine/packages/shared) | Shared TypeScript schemas, contracts & telemetry types |
| [`@vaagatech/anvesh-plugins`](file:///Users/karthiksp/projects/searchengine/packages/plugins) | Extensible plugin runtime host |

---

## Key Capabilities

- ⚡ **Hybrid Search & Vector Retrieval**: BM25 inverted index combined with dense vector semantic search using Reciprocal Rank Fusion (RRF) and cosine / euclidean / dot product distance.
- 🎨 **Non-AI Visual & OCR Feature Extractor**: Extracts text/labels via local OCR (`tesseract.js`), dominant color palettes (e.g. `"Gold Zari"`, `"Royal Blue"`), and pattern/motif edge descriptors (`"Peacock/Elephant Motif"`, `"Checks"`, `"Temple Border"`) without external cloud AI dependencies.
- 📐 **Semantic Synonyms & Bounded Highlighting**: Intelligent query term expansion with strict 240-character sentence-boundary snippet truncation for search results.
- ⚙️ **Config-as-Code & GitOps**: Complete declarative schema management via `anvesh plan`, `anvesh apply`, and `/v1/config/*` APIs without pod redeployments.
- 🛡️ **3-Tier Throttling & Concurrency Protection**: Rate limiting (`ANVESH_RATE_LIMIT`), in-flight simultaneous query slots (`ANVESH_MAX_CONCURRENT_SEARCH`), and memory heap backpressure guards (`ERR_CIRCUIT_MEMORY`).
- 📉 **SQ8 Vector Quantization**: 8-bit scalar quantization reducing vector RAM footprint by 75% with >98% recall accuracy.
- 💾 **Tiered Storage & Object Store**: Hot in-memory segments, warm local SSD storage, and cold cloud object storage tiering with immutable segment blocks.
- 🛡️ **Zero-Drop Dead-Letter Queue (DLQ)**: Isolated persistence for corrupted or malformed documents with automated retry policies and one-click replay into search indices.
- 📊 **Embedded Observability & Live Telemetry**: Real-time QPS charts, latency percentiles (p50, p95, p99), memory breakdown (RSS, Heap, Segments), and distributed node health tracking.
- 🕷️ **Automated Web Crawler (Spider)**: Configurable multi-worker site crawler with automatic schema detection, depth control, and instant vector embedding.
- 🔐 **Hub Control Plane & RBAC**: Centralized management with AWS Cognito JWT authentication, multi-cluster federation, and role-based permissions (`admin`, `operator`, `viewer`).

---

## Client SDK Quickstart

### 1. Installation
```bash
npm install @vaagatech/anvesh-sdk
```

### 2. Connect and Search
```typescript
import { AnveshClient } from "@vaagatech/anvesh-sdk";

const client = new AnveshClient({
  baseUrl: "https://fgqza9ykw7.execute-api.us-east-1.amazonaws.com/anvesh",
  m2m: {
    clientId: process.env.ANVESH_CLIENT_ID!,
    clientSecret: process.env.ANVESH_CLIENT_SECRET!,
    tokenUrl: "https://k3s-auth-3zhl7f.auth.us-east-1.amazoncognito.com/oauth2/token",
    scope: "https://api.vaagatech.com/apps.all",
  },
});

// Run hybrid search
const results = await client.search("products", {
  q: "festive silk saree with elephant zari",
  mode: "hybrid",
  highlight: true,
});

console.log(`Found ${results.total} products:`, results.hits);
```

---

## Anvesh CLI Quickstart

```bash
# Initialize declarative configuration
anvesh init

# Inspect pending schema drift vs live cluster
anvesh plan -f anvesh.config.json

# Apply declarative schema changes
anvesh apply -f anvesh.config.json

# Run instant hybrid search from terminal
anvesh search products -q "saree"

# Run local OCR on an image
anvesh ocr path/to/image.jpg
```

---

## Terraform Provider

```hcl
terraform {
  required_providers {
    anvesh = {
      source  = "vaagatech/anvesh"
      version = "~> 0.4.0"
    }
  }
}

provider "anvesh" {
  url           = "https://fgqza9ykw7.execute-api.us-east-1.amazonaws.com/anvesh"
  token_url     = "https://k3s-auth-3zhl7f.auth.us-east-1.amazoncognito.com/oauth2/token"
  client_id     = var.anvesh_client_id
  client_secret = var.anvesh_client_secret
}

resource "anvesh_index" "products" {
  name                     = "products"
  vector_dimensions        = 256
  auto_embed               = true
  enable_visual_extraction = true
  ocr_enabled              = true
  color_extraction         = true
  motif_extraction         = true

  mapping {
    name = "name"
    type = "text"
  }
  mapping {
    name = "category"
    type = "keyword"
  }
}
```

---

## Local Cluster Quickstart

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

## License

MIT © [VaagaTech](https://www.vaagatech.com)
