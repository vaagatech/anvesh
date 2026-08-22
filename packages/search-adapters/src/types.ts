/**
 * Anvesh search adapter contracts — map a portable query subset to external backends.
 */

export type SearchBackendKind = "anvesh" | "elasticsearch" | "opensearch" | "solr";

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

export interface AnveshSearchQuery {
  q?: string;
  fields?: string[];
  vector?: number[];
  mode?: "keyword" | "semantic" | "hybrid" | "geo";
  filters?: Array<TermFilter | RangeFilter>;
  from?: number;
  size?: number;
  fuzziness?: boolean | 0 | 1 | 2 | "AUTO";
  phrase?: boolean;
  phraseSlop?: number;
  prefix?: boolean;
  boosts?: Record<string, number>;
  must?: Array<{ field: string; value: string | number | boolean }>;
  should?: Array<{ field: string; value: string | number | boolean }>;
  mustNot?: Array<{ field: string; value: string | number | boolean }>;
  /**
   * MongoDB-style projection spec (e.g. { title: 1, price: 1, _id: 0 } or { body: 0 } or ["title", "price"]).
   */
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
}

export interface AnveshSearchHit {
  id: string;
  score: number;
  source: { id: string; fields: Record<string, unknown> };
  highlight?: Record<string, string[]>;
}

export interface AnveshSearchResult {
  tookMs: number;
  total: number;
  hits: AnveshSearchHit[];
  message: string;
}

export interface IndexInfo {
  name: string;
  docCount?: number;
  mappings?: Record<string, { type: string }>;
  settings?: Record<string, unknown>;
}

export interface SearchBackend {
  kind: SearchBackendKind;
  health(): Promise<boolean>;
  listIndexes(): Promise<IndexInfo[]>;
  createIndex(def: {
    name: string;
    mappings: Record<string, { type: string }>;
    settings?: Record<string, unknown>;
  }): Promise<void>;
  deleteIndex(name: string): Promise<void>;
  bulk(
    index: string,
    docs: Array<{ id?: string; fields: Record<string, unknown> }>,
  ): Promise<{ indexed: number; failed: number }>;
  search(index: string, query: AnveshSearchQuery): Promise<AnveshSearchResult>;
}

export interface CreateSearchBackendOptions {
  kind: SearchBackendKind;
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}
