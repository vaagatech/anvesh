import { TokenManager } from "./auth.js";
import { ConfigClient } from "./config.js";
import { DocumentsClient } from "./documents.js";
import { IndexesClient } from "./indexes.js";
import { SearchClient } from "./search.js";
import { SpiderClient } from "./spider.js";
import { ToolsClient } from "./tools.js";
import { GraphClient } from "./graph.js";
import type { AnveshClientOptions, SearchQuery, SearchResult } from "./types.js";

export class AnveshClient {
  public readonly indexes: IndexesClient;
  public readonly documents: DocumentsClient;
  public readonly searchClient: SearchClient;
  public readonly spider: SpiderClient;
  public readonly config: ConfigClient;
  public readonly tools: ToolsClient;
  public readonly graph: GraphClient;

  private readonly tokenManager: TokenManager;
  private readonly baseUrl: string;

  constructor(options: AnveshClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.tokenManager = new TokenManager({
      apiKey: options.apiKey,
      m2m: options.m2m,
    });

    this.indexes = new IndexesClient(this.baseUrl, this.tokenManager);
    this.documents = new DocumentsClient(this.baseUrl, this.tokenManager);
    this.searchClient = new SearchClient(this.baseUrl, this.tokenManager);
    this.spider = new SpiderClient(this.baseUrl, this.tokenManager);
    this.config = new ConfigClient(this.baseUrl, this.tokenManager);
    this.tools = new ToolsClient(this.baseUrl, this.tokenManager);
    this.graph = new GraphClient(this.baseUrl, this.tokenManager);
  }

  /**
   * Shortcut for executing a search query on a named index.
   */
  async search<T = Record<string, any>>(index: string, query: SearchQuery): Promise<SearchResult<T>> {
    return this.searchClient.search<T>(index, query);
  }

  /**
   * Check health of the search cluster.
   */
  async health(): Promise<{ ok: boolean; status: string; uptimeMs: number; [key: string]: any }> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/health`, { headers });
    if (!res.ok) throw new Error(`Health check failed: ${await res.text()}`);
    return (await res.json()) as { ok: boolean; status: string; uptimeMs: number };
  }
}
