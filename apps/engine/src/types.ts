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

export interface IndexSettings {
  /** BM25 k1 (term frequency saturation). Default 1.2 */
  bm25k1?: number;
  /** BM25 b (length normalization). Default 0.75 */
  bm25b?: number;
  /** Expected vector dimensions when using semantic search. */
  vectorDimensions?: number;
  /**
   * When true (default if vectorDimensions set), embed text fields / queries
   * locally if no vector is provided.
   */
  autoEmbed?: boolean;
  /** Hybrid blend: weight for keyword score (0–1). Semantic gets 1 - keywordWeight. */
  hybridKeywordWeight?: number;
  /** Max documents kept in a single shard segment before flush hints. */
  softMaxDocs?: number;
  /**
   * When true (default), infer and add mappings for unknown fields on ingest.
   * Set false for strict schema-only indexes.
   */
  dynamicMapping?: boolean;
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

export interface SearchQuery {
  /** Full-text query string. */
  q?: string;
  /** Fields to search; default all text fields. */
  fields?: string[];
  /** Pre-computed query embedding for semantic / hybrid search. */
  vector?: number[];
  /** keyword | semantic | hybrid | geo */
  mode?: "keyword" | "semantic" | "hybrid" | "geo";
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
  message: string;
}
