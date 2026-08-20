# Anvesh Architecture, Sizing & Benchmark Guide

## 1. High-Performance Architecture Overview

Anvesh is an ultra-lightweight, cloud-native search engine and vector database designed to run in resource-constrained environments (e.g., low-memory Kubernetes pods, edge nodes, or standard cloud VMs) without requiring JVM runtimes or multi-gigabyte memory allocations.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Anvesh Microservices Core                         │
│                                                                             │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────────┐  │
│  │   anvesh-engine:3848  │  │   anvesh-spider:3851  │  │anvesh-indexer   │  │
│  │  (BM25 + Vector DB)   │  │  (Web Crawler Worker) │  │  :3852 (Bulk)   │  │
│  └───────────┬───────────┘  └───────────┬───────────┘  └────────┬────────┘  │
│              │                          │                       │           │
│              └──────────────────────────┼───────────────────────┘           │
│                                         ▼                                   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       Tiered Persistent Storage                       │  │
│  │                                                                       │  │
│  │  ┌─────────────────────────────┐     ┌─────────────────────────────┐  │  │
│  │  │  Tier 1: Fast Local Volume  │     │ Tier 2: Cloud Object Storage│  │  │
│  │  │  (/data - NVMe/SSD Cache)   │     │  (OCI Object Storage / S3)  │  │  │
│  │  │                             │     │                             │  │  │
│  │  │ • Microsecond search reads  │     │ • Multi-AZ Durability       │  │  │
│  │  │ • SQ8 Scalar Quantization   │     │ • Versioned Snapshots       │  │  │
│  │  │ • Atomic writes & SHA-256   │     │ • Self-healing corruption   │  │  │
│  │  └─────────────────────────────┘     └─────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Low-Memory Architecture for Large Indexes (2GB to 100GB)

Operating a 2GB to 100GB index with low RAM constraints is achieved through four architectural pillars:

### A. Paged Shard Storage & Streaming Posting Lists
- Unlike monolithic in-memory inverted indexes, Anvesh segments document corpora and inverted posting lists onto local NVMe/SSD disks and remote object stores.
- Document bodies and payloads are fetched on-demand during result collation rather than retained in the V8 heap.

### B. Scalar Quantization (SQ8)
- High-dimensional dense vectors (e.g. 384d, 768d, 1536d) are compressed from 32-bit floating point (`Float32Array`) to 8-bit quantized integers (`Int8Array`).
- **Memory Reduction**: **75% reduction in RAM**.
- **Accuracy**: Retains **>98.5% cosine recall** compared to uncompressed float32 arrays.

### C. LRU Inactive Shard Unloading
- Inactive index shards automatically unload their heavy inverted postings from RAM when idle, retaining only lightweight metadata headers.
- When queries arrive, shards are hydrated into memory in sub-milliseconds.

---

## 3. Query-Time Weightage Scoring (Conditional Boost Rules)

Anvesh provides advanced JSON query boosting with custom conditional rules, allowing operators to prioritize specific documents without re-indexing.

### Query Format
```json
POST /v1/indexes/products/search
{
  "q": "cloud storage infrastructure",
  "size": 10,
  "boostRules": [
    {
      "filter": { "field": "category", "equals": "featured" },
      "weight": 5.0,
      "mode": "multiply"
    },
    {
      "filter": { "field": "status", "equals": "archived" },
      "weight": 0.5,
      "mode": "multiply"
    },
    {
      "filter": { "field": "rating", "gte": 4.5 },
      "weight": 1.5,
      "mode": "multiply"
    }
  ]
}
```

### Supported Filter Operators in `boostRules`
- `equals`: Exact match (`string`, `number`, `boolean`)
- `notEquals`: Inversion match
- `in`: Array membership match (`["enterprise", "pro"]`)
- `gt` / `gte` / `lt` / `lte`: Numeric range checks
- `exists`: Field presence check

---

## 4. Benchmark Results: Anvesh vs. Elasticsearch / OpenSearch

Tested on an OCI Ampere A1 (ARM64 / 4 OCPUs, 24GB RAM) with 5,000 dense-vector documents:

| Metric                          | Anvesh (Node.js 24) | Elasticsearch / OpenSearch (Java 21) |
|---------------------------------|---------------------|--------------------------------------|
| **BM25 Search Latency (p50)**   | **< 0.1 ms**        | ~8.2 ms                              |
| **BM25 Search Latency (p99)**   | **0.36 ms**         | ~24.5 ms                             |
| **BM25 Query Throughput**       | **46,416 QPS**      | ~6,500 QPS                           |
| **Vector Search Latency (p50)** | **< 0.1 ms**        | ~12.4 ms                             |
| **Vector Search Latency (p99)** | **2.16 ms**         | ~38.0 ms                             |
| **Vector Query Throughput**     | **10,919 QPS**      | ~2,200 QPS                           |
| **RAM Footprint (10k docs)**    | **~25 MB**          | ~512 MB - 1 GB (JVM Heap)            |
| **Container Image Size**        | **75 MB (Alpine)**  | ~650 MB - 1.2 GB                     |

---

## 5. Worker Scaling: Horizontal Pod Autoscaler (HPA)

### Why HPA is Recommended over Manual Worker Registration:
1. **Zero Manual Configuration**: The internal K3s services (`anvesh-spider-service:3851` and `anvesh-indexer-service:3852`) load-balance traffic across all live replicas automatically.
2. **Dynamic Elasticity**: When indexing queues spike, HPA scales from 1 replica up to 5 replicas. Once the backlog drains, it automatically scales back down.
3. **No Customer Burden**: Customers never have to configure worker endpoints. Only external 3rd-party clusters (e.g. external Elasticsearch or AWS OpenSearch) require manual registration.
