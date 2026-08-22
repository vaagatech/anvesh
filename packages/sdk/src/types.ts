/**
 * Anvesh SDK Types & Interfaces
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type DocumentId = string;

export interface AnveshDocument<T = Record<string, any>> {
  id: DocumentId;
  fields: Record<string, JsonValue>;
  vector?: number[];
  meta?: T;
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
  store?: boolean;
  index?: boolean;
  analyzer?: string;
}

export interface IndexSettings {
  dynamicMapping?: boolean;
  vectorDimensions?: number;
  vectorMetric?: "cosine" | "dot_product" | "euclidean";
  autoEmbed?: boolean;
  hybridKeywordWeight?: number;
  bm25k1?: number;
  bm25b?: number;
  enableVisualExtraction?: boolean;
  ocrEnabled?: boolean;
  colorExtraction?: boolean;
  motifExtraction?: boolean;
  defaultOperator?: "AND" | "OR";
  minimumShouldMatch?: string | number;
  [key: string]: any;
}

export interface IndexDefinition {
  name: string;
  mappings: Record<string, FieldMapping>;
  settings?: IndexSettings;
  createdAt: string;
  updatedAt: string;
  docCount: number;
}

export interface SearchQuery {
  q?: string;
  fields?: string[];
  vector?: number[];
  mode?: "keyword" | "semantic" | "hybrid" | "geo";
  filters?: Array<{ field: string; value: any }>;
  from?: number;
  size?: number;
  highlight?: boolean;
  minScore?: number;
  boosts?: Record<string, number>;
  operator?: "AND" | "OR";
  /** Minimum percentage or count of query tokens that must match (e.g. "100%", "75%", 2). */
  minimumShouldMatch?: string | number;
  /** MongoDB-style projection spec (e.g. { title: 1, price: 1, _id: 0 } or { body: 0 } or ["title", "price"]). */
  projection?:
    | Record<string, number | boolean>
    | string[]
    | string
    | boolean
    | { includes?: string[]; excludes?: string[] };
  /** SQL/REST alias for field projection. */
  select?: string[] | string | Record<string, number | boolean>;
  /** Elasticsearch _source filter alias. */
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
  [key: string]: any;
}

export interface SearchHit<T = Record<string, any>> {
  id: DocumentId;
  score: number;
  source: AnveshDocument<T>;
  highlight?: Record<string, string[]>;
  distanceKm?: number;
}

export interface SearchResult<T = Record<string, any>> {
  ok: boolean;
  total: number;
  tookMs: number;
  hits: SearchHit<T>[];
  message?: string;
  facets?: Record<string, any>;
}

export interface BulkIndexItem {
  action: "index" | "delete";
  id: DocumentId;
  fields?: Record<string, JsonValue>;
  meta?: Record<string, JsonValue>;
}

export interface BulkIndexResult {
  indexed: number;
  failed: number;
  errors?: Array<{ id: DocumentId; error: string }>;
}

export interface SpiderCrawlRequest {
  startUrls: string[];
  allowedDomains?: string[];
  maxPages?: number;
  maxDepth?: number;
  targetIndex?: string;
  scheduleCron?: string;
}

export interface SpiderJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  targetIndex: string;
  pagesCrawled: number;
  documentsIndexed: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface AnveshConfigSpec {
  version?: string;
  indexes?: Array<{
    name: string;
    mappings?: Record<string, FieldMapping>;
    settings?: IndexSettings;
    aliases?: string[];
  }>;
  spiderTargets?: Array<{
    name: string;
    targetUrl: string;
    indexName: string;
    maxDepth?: number;
    maxPages?: number;
    allowedDomains?: string[];
    scheduleCron?: string;
  }>;
  circuits?: {
    maxBodyBytes?: number;
    maxBulkDocs?: number;
    maxConcurrentSearch?: number;
    maxResultWindow?: number;
    maxRssMb?: number;
    maxDocsPerIndex?: number;
    maxFuzzyCandidates?: number;
  };
}

export interface ConfigPlanResult {
  actions: Array<{
    type: string;
    target: string;
    details: Record<string, unknown>;
  }>;
  hasChanges: boolean;
}

export interface ConfigApplyResult {
  applied: Array<{
    type: string;
    target: string;
    details: Record<string, unknown>;
  }>;
  errors: Array<{ target: string; error: string }>;
  success: boolean;
}

export interface OcrResult {
  text: string;
  confidence: number;
  lines: string[];
  words: string[];
}

export interface VisualExtractionResult {
  ocr: OcrResult;
  colors: {
    dominant: string[];
    palette: Array<{ name: string; percentage: number }>;
  };
  motifs: {
    motifs: string[];
    textureType: string;
    edgeDensity: number;
    patternKeywords: string[];
  };
  searchableText: string;
  tags: string[];
}

export interface AutocompleteSuggestion {
  text: string;
  type: "query" | "phrase" | "category" | "document" | "visual_tag" | "motif" | "color" | "entity";
  score: number;
  count?: number;
  field?: string;
  docId?: string;
  payload?: Record<string, unknown>;
}

export interface ImageMetadataResult {
  ocr: {
    text: string;
    confidence: number;
    words: string[];
  };
  colors: string[];
  motifs: string[];
  tags: string[];
  suggestedKeywords: string[];
  autocompleteSuggestions: AutocompleteSuggestion[];
}

export interface GraphEntity {
  id: string;
  name: string;
  type: string;
  aliases?: string[];
  properties?: Record<string, unknown>;
  docIds?: string[];
}

export interface GraphTriple {
  subject: string;
  predicate: string;
  object: string;
  weight?: number;
}

export interface GraphNeighborhood {
  entity: GraphEntity;
  nodes: GraphEntity[];
  edges: GraphTriple[];
}

export interface GraphSearchResult {
  entities: GraphEntity[];
  expandedTerms: string[];
  relatedDocIds: string[];
  edges: GraphTriple[];
}

export interface AnveshClientOptions {
  baseUrl: string;
  apiKey?: string;
  m2m?: {
    clientId: string;
    clientSecret: string;
    tokenUrl: string;
    scope?: string;
  };
  timeoutMs?: number;
  retries?: number;
}
