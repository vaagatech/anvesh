import type { TokenManager } from "./auth.js";
import type { SearchQuery, SearchResult } from "./types.js";

export class SearchClient {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenManager: TokenManager
  ) {}

  async search<T = Record<string, any>>(index: string, query: SearchQuery): Promise<SearchResult<T>> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(
      `${this.baseUrl}/v1/indexes/${encodeURIComponent(index)}/search`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(query),
      }
    );
    if (!res.ok) throw new Error(`Search failed: ${await res.text()}`);
    return (await res.json()) as SearchResult<T>;
  }

  async suggest(index: string, prefix: string, field?: string, size = 5): Promise<string[]> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(
      `${this.baseUrl}/v1/indexes/${encodeURIComponent(index)}/suggest`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ prefix, field, size }),
      }
    );
    if (!res.ok) throw new Error(`Suggest failed: ${await res.text()}`);
    const data = (await res.json()) as { ok: boolean; suggestions: string[] };
    return data.suggestions;
  }
}
