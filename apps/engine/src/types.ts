/**
 * Anvesh — shared types for documents, indexes, and search.
 * Lightweight search by VaagaTech (https://www.vaagatech.com)
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type DocumentId = string;

export interface AnveshDocument {
  id: DocumentId;
  /** Indexed fields (text + keyword). */
  fields: Record<string, JsonValue>;
  /** Optional dense embedding for semantic search. */
  vector?: number[];
  /** Opaque metadata returned with hits; not scored by default. */
  meta?: Record<string, JsonValue>;
  updatedAt?: string;
}

export type FieldType =
  | "text"
  | "keyword"
  | "number"
  | "boolean"
  | "date"
  | "vector"
  | "geo_point";

export interface FieldMapping {
  type: FieldType;
  /** When true, field is stored for retrieval (default true). */
  store?: boolean;
  /** When true, field is searchable (default true for text/keyword). */
  index?: boolean;
  /** Analyzer name for text fields. */
  analyzer?: string;
}

export type VectorMetric = "cosine" | "dot_product" | "euclidean";
export type VectorIndexType = "flat" | "hnsw";
export type VectorQuantization = "none" | "sq8";
export type HybridRankingMode = "linear" | "rrf";

export interface IndexSettings {
  /** BM25 k1 (term frequency saturation). Default 1.2 */
  bm25k1?: number;
  /** BM25 b (length normalization). Default 0.75 */
  bm25b?: number;
  /** Expected vector dimensions when using semantic search. */
  vectorDimensions?: number;
  /** Vector similarity metric: cosine (default), dot_product, euclidean. */
  vectorMetric?: VectorMetric;
  /** Vector index structure: flat (default), hnsw. */
  vectorIndexType?: VectorIndexType;
  /** Quantization for vector memory compression: none (default), sq8. */
  vectorQuantization?: VectorQuantization;
  /**
   * When true (default if vectorDimensions set), embed text fields / queries
   * locally if no vector is provided.
   */
  autoEmbed?: boolean;
  /** Hybrid blend: weight for keyword score (0–1). Semantic gets 1 - keywordWeight. */
  hybridKeywordWeight?: number;
  /** RRF constant for Reciprocal Rank Fusion hybrid scoring. Default 60. */
  rrfK?: number;
  /** Hybrid search strategy: "linear" min-max blend or "rrf" reciprocal rank fusion. Default "linear". */
  hybridRankingMode?: HybridRankingMode;
  /** Max LRU cached search results per index segment. Default 100. */
  queryCacheSize?: number;
  /** Max documents kept in a single shard segment before flush hints. */
  softMaxDocs?: number;
  /**
   * When true (default), infer and add mappings for unknown fields on ingest.
   * Set false for strict schema-only indexes.
   */
  dynamicMapping?: boolean;
  /**
   * When true (default), enables non-AI visual color, motif & OCR feature extraction for documents with images.
   * Set false to disable all visual processing.
   */
  enableVisualExtraction?: boolean;
  /** When false, disables OCR text extraction specifically. Default true. */
  ocrEnabled?: boolean;
  /** When false, disables dominant color extraction. Default true. */
  colorExtraction?: boolean;
  /** When false, disables motif & pattern detection. Default true. */
  motifExtraction?: boolean;
  /** Default boolean operator for multi-term queries: "AND" | "OR". Default "OR". */
  defaultOperator?: "AND" | "OR";
  /** Minimum percentage or count of terms that must match (e.g. "100%", "75%", 2). */
  minimumShouldMatch?: string | number;
  /** When true (default), enables Knowledge Graph entity & triple storage and semantic graph search. */
  enableKnowledgeGraph?: boolean;
  /** Optional pluggable embedding configuration (e.g. "local", "openai", "gemini", "ollama", "custom"). Defaults to zero-overhead "local". */
  embeddingConfig?: import("./core/embedding-adapters.js").EmbeddingConfig;
}

export interface IndexDefinition {
  name: string;
  mappings: Record<string, FieldMapping>;
  settings?: IndexSettings;
  createdAt: string;
  updatedAt: string;
  docCount: number;
}

export type QueryOperator = "and" | "or";

export interface TermFilter {
  field: string;
  value: string | number | boolean;
}

export interface RangeFilter {
  field: string;
  gte?: number | string;
  lte?: number | string;
  gt?: number | string;
  lt?: number | string;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface GeoBoundingBox {
  /** North latitude */
  top: number;
  /** West longitude */
  left: number;
  /** South latitude */
  bottom: number;
  /** East longitude */
  right: number;
}

/** Location filter / distance sort for search requests. */
export interface GeoQuery {
  /** Mapped geo_point field name. */
  field: string;
  /** Center for radius filter and/or distance sort. */
  origin?: GeoPoint;
  /** Include docs within this many kilometers of origin (requires origin). */
  distanceKm?: number;
  /** Axis-aligned bounding box filter. */
  boundingBox?: GeoBoundingBox;
  /**
   * Sort results by distance from origin (ascending).
   * Defaults to true when origin is set and there is no text/vector ranking.
   */
  sortByDistance?: boolean;
}


export interface BoostFilter {
  field: string;
  equals?: string | number | boolean;
  notEquals?: string | number | boolean;
  in?: Array<string | number | boolean>;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  exists?: boolean;
}

export interface BoostRule {
  filter: BoostFilter;
  /** Multiplier (e.g. 5 for 5x, 0.5 for 0.5x) or additive weight */
  weight: number;
  mode?: "multiply" | "add";
}

export interface SearchQuery {
  /** Full-text query string. */
  q?: string;
  /** Fields to search; default all text fields. */
  fields?: string[];
  /** Pre-computed query embedding for semantic / hybrid search. */
  vector?: number[];
  /** keyword | semantic | hybrid | geo */
  mode?: "keyword" | "semantic" | "hybrid" | "geo";
  /** Override vector distance metric: cosine | dot_product | euclidean */
  vectorMetric?: VectorMetric;
  /** Hybrid strategy: "linear" | "rrf" */
  hybridRankingMode?: HybridRankingMode;
  /** Reciprocal Rank Fusion constant K when hybridRankingMode is "rrf". Default 60. */
  rrfK?: number;
  filters?: Array<TermFilter | RangeFilter>;
  /** Location filter / distance sort (radius, bounding box). */
  geo?: GeoQuery;
  from?: number;
  size?: number;
  highlight?: boolean;
  facets?: string[];
  /** Minimum score threshold after normalization. */
  minScore?: number;
  /** Fuzzy edit distance: false/0/1/2/"AUTO". */
  fuzziness?: boolean | 0 | 1 | 2 | "AUTO";
  /** Prefer phrase match (ordered terms). */
  phrase?: boolean;
  /** Allowed gaps between phrase terms. */
  phraseSlop?: number;
  /** Prefix match each query token. */
  prefix?: boolean;
  /** Per-field score multipliers. */
  boosts?: Record<string, number>;
  /** Conditional weightage scoring rules (e.g. category === "featured" -> 5x). */
  boostRules?: BoostRule[];
  /** ElasticSearch-compatible function_score alias. */
  functions?: BoostRule[];
  /** Cursor for deep pagination (document id). */
  searchAfter?: string;
  /** Bool subset */
  must?: Array<{ field: string; value: string | number | boolean }>;
  should?: Array<{ field: string; value: string | number | boolean }>;
  mustNot?: Array<{ field: string; value: string | number | boolean }>;
  /** Cap fuzzy/wildcard expansion (from circuit breaker). */
  maxFuzzyCandidates?: number;
  /** Facet modes: "field" (terms), "stats:field", "histogram:field:interval" */
  facetKinds?: string[];
  /** Conjunction operator: "AND" (all tokens required) | "OR" (any token matches). */
  operator?: "AND" | "OR";
  /** Minimum percentage or count of query tokens that must match (e.g. "100%", "75%", 2). */
  minimumShouldMatch?: string | number;
  /**
   * MongoDB-style projection spec (e.g. { title: 1, price: 1, _id: 0 } or { body: 0 } or ["title", "price"]).
   * Controls which fields are returned in hit sources.
   */
  projection?:
    | Record<string, number | boolean | string>
    | string[]
    | string
    | boolean
    | { includes?: string[]; excludes?: string[] };
  /** SQL/REST alias for field projection (e.g. ["title", "price"] or "title,price"). */
  select?: string[] | string | Record<string, number | boolean | string>;
  /** Elasticsearch _source filter alias (e.g. false | ["title*"] | { includes: [...], excludes: [...] }). */
  _source?:
    | boolean
    | string[]
    | string
    | { includes?: string[]; excludes?: string[] };
  /** Explicit list of return fields. */
  returnFields?: string[];
  /** Explicit list of fields to include in projection. */
  includeFields?: string[];
  /** Explicit list of fields to exclude from projection. */
  excludeFields?: string[];
}

export interface SearchHit {
  id: DocumentId;
  score: number;
  source: AnveshDocument;
  highlight?: Record<string, string[]>;
  /** Distance from geo.origin in kilometers, when geo search is used. */
  distanceKm?: number;
}

export interface FacetBucket {
  key: string | number | boolean;
  count: number;
}

export interface SearchResult {
  tookMs: number;
  total: number;
  hits: SearchHit[];
  facets?: Record<string, FacetBucket[]>;
  message: string;
}

export interface BulkIndexItem {
  id?: DocumentId;
  fields: Record<string, JsonValue>;
  vector?: number[];
  meta?: Record<string, JsonValue>;
}

export interface BulkIndexResult {
  indexed: number;
  failed: number;
  errors: Array<{ id?: string; message: string }>;
  deadLetterCount?: number;
  message: string;
}
