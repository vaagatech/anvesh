import { createSearchBackend } from "./factory.js";

export { createSearchBackend, createSearchBackend as default };
export { AdapterUnsupportedError, ERR_ADAPTER_UNSUPPORTED } from "./errors.js";
export { HttpClient } from "./http.js";
export {
  assertElasticsearchSupported,
  mapAnveshMappingsToElasticsearch,
  mapAnveshQueryToElasticsearch,
  mapElasticsearchSearchResponse,
} from "./mappers/elasticsearch.js";
export {
  assertSolrSupported,
  mapAnveshQueryToSolr,
  mapSolrSearchResponse,
} from "./mappers/solr.js";
export type {
  AnveshSearchHit,
  AnveshSearchQuery,
  AnveshSearchResult,
  CreateSearchBackendOptions,
  IndexInfo,
  RangeFilter,
  SearchBackend,
  SearchBackendKind,
  TermFilter,
} from "./types.js";

export {
  hubKindToBackendKind,
  isSearchBackendHubKind,
  SEARCH_BACKEND_HUB_KINDS,
} from "./hub.js";
