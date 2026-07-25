# Anvesh Product Features & Technical Capabilities

Anvesh is a lightweight, enterprise-grade search engine and vector database designed for high performance (nano-to-millisecond latency), small memory footprint, zero-dependency deployment, and scale from single-node small projects to distributed TB-scale enterprise deployments.

---

## 1. Full-Text Search Engine & BM25 Scoring
- **BM25 Scoring**: Configurable term frequency saturation (`bm25k1`) and length normalization (`bm25b`).
- **Postings & Position Indexing**: Precise word position tracking supporting exact phrase matches (`phrase`) and slop distance tolerance (`phraseSlop`).
- **Fuzzy Search**: Levenshtein edit distance (`fuzziness`: `0`, `1`, `2`, `"AUTO"`) with candidate capping circuit breakers to prevent query degradation.
- **Prefix & Wildcard Queries**: Prefix token matching (`prefix: true`) and glob pattern expansion (`*`, `?`).
- **Field Boosts & Multi-field Search**: Custom per-field score multipliers (`boosts: { title: 2.0, body: 1.0 }`).
- **Faceted Aggregations**:
  - **Term Facets**: Top-N field value distribution counts.
  - **Stats Facets**: Numeric metrics (`count`, `min`, `max`, `avg`, `sum`).
  - **Histogram Facets**: Fixed-interval numeric binning (`histogram:price:10`).
- **Geo-Spatial Radius & Bounding Box**: Spatial distance calculation (`haversine`), radius filtering (`distanceKm`), bounding box filtering (`top`, `left`, `bottom`, `right`), and distance sorting.

---

## 2. Native Vector Database Engine
- **Multi-Metric Similarity**:
  - `cosine`: Cosine similarity score normalized to `[-1.0, 1.0]`.
  - `dot_product`: Un-normalized dot product vector multiplication.
  - `euclidean`: Euclidean L2 distance converted to normalized similarity `1 / (1 + distance)`.
- **HNSW Graph Indexing**: Hierarchical Navigable Small World (HNSW) graph structure for logarithmic $O(\log N)$ ANN vector retrieval.
- **SQ8 Scalar Quantization**: 8-bit scalar quantization compresses vector Float32 arrays into Int8Arrays, reducing memory usage by ~75% while maintaining >98% accuracy.
- **Candidates Pre-filtering**: Filters vectors based on inverted index attribute criteria prior to similarity scoring.
- **Local Embedding Engine**: Automated local text-to-vector embedding for zero-config semantic search without requiring external AI services.

---

## 3. Hybrid Search & Fusion Ranking
- **Linear Min-Max Blending**: Normalizes keyword BM25 and vector similarity scores to `[0, 1]` and blends them using custom weights (`hybridKeywordWeight`).
- **Reciprocal Rank Fusion (RRF)**: Advanced rank fusion algorithm (`score = sum(1 / (k + rank))`) combining separate keyword and vector result rankings with configurable $k$ constant (default `60`).
- **Score Threshold Filtering**: Minimum score threshold (`minScore`) filtering to exclude irrelevant long-tail results.

---

## 4. Sub-Millisecond Performance & Caching
- **LRU Query Result Cache**: Built-in per-index query cache storing search results for fast sub-millisecond (<0.1ms) repeated queries. Automatic invalidation on write/upsert.
- **Circuit Breakers**: Memory circuit breaker, maximum result window caps, and fuzzy candidate bounds to guarantee system stability under high query loads.

---

## 5. Storage Adapters & Distributed File System (DFS)
- **Memory Storage**: Blazing fast zero-disk transient storage for unit testing and ephemeral workers.
- **Filesystem Storage**: Atomic file persistence for local developer instances and single-container deployments.
- **Distributed File System Storage (`dfs`)**: Block-level chunking (`blockSizeMb`, manifest index streaming) designed for distributed mounts (HDFS, CephFS, GlusterFS, NFS) supporting TB-scale index data.
- **Cloud & NoSQL Adapters**: AWS S3 / S3-compatible Object Storage, Redis, AWS DynamoDB, and MongoDB.

---

## 6. Distributed Processing & Cluster Coordinator
- **Scatter-Gather Query Router**: Broadcasts search requests across cluster shards in parallel and merges document hits, scores, and facets.
- **FNV-1a Consistent Hash Partitioning**: Automatically partitions document IDs across shard nodes for balanced document distribution.
- **Map-Reduce Facet Merging**: Aggregates term counts, histogram buckets, and statistical metrics across multiple node shards.
- **Cluster Node Health Monitoring**: Automatically tracks healthy, replica, and offline nodes.

---

## 7. Control Plane Hub & Modern Web UI
- **Role-Based Access Control (RBAC)**: Fine-grained permissions for `admin`, `operator`, and `viewer` roles.
- **Multi-Instance Management**: Automatically registers and manages multiple Engine, Spider, and Indexer instances.
- **Web UI Mappings & Visual Indexer**: Modern glassmorphic Web UI dashboard for inspecting schemas, creating indexes, testing search queries, and viewing cluster telemetry.

---

## 8. Automated Site Crawler & Bulk Indexer
- **Spider Crawler**: Asynchronous web crawler with role-based login session state support, robots.txt parsing, link extraction, HTML content stripping, and automatic indexing.
- **Bulk Indexer**: High-throughput batch indexing API and worker service for processing millions of documents with error reporting.

---

## 9. Search Adapters & Plugin Architecture
- **Elasticsearch & Solr Proxies**: Drop-in search adapters allowing existing applications built for Elasticsearch or Apache Solr to query Anvesh transparently.
- **Plugin System**: Tool-style plugin host supporting custom analyzers, telemetry plugins, and Vaakly messaging.
