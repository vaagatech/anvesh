import { createAnveshAdapter } from "./adapters/anvesh.js";
import { createElasticsearchAdapter } from "./adapters/elasticsearch.js";
import { createSolrAdapter } from "./adapters/solr.js";
import { HttpClient } from "./http.js";
import type { CreateSearchBackendOptions, SearchBackend } from "./types.js";

export function createSearchBackend(options: CreateSearchBackendOptions): SearchBackend {
  const client = new HttpClient({
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
  });

  switch (options.kind) {
    case "anvesh":
      return createAnveshAdapter(client);
    case "elasticsearch":
      return createElasticsearchAdapter(client, "elasticsearch");
    case "opensearch":
      return createElasticsearchAdapter(client, "opensearch");
    case "solr":
      return createSolrAdapter(client);
    default: {
      const _exhaustive: never = options.kind;
      throw new Error(`Unknown search backend kind: ${_exhaustive}`);
    }
  }
}
