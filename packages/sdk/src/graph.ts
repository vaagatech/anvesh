import type { TokenManager } from "./auth.js";
import type { GraphEntity, GraphTriple, GraphNeighborhood, GraphSearchResult } from "./types.js";

export class GraphClient {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenManager: TokenManager
  ) {}

  async addEntities(indexName: string, entities: GraphEntity[]): Promise<{ added: number }> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/indexes/${encodeURIComponent(indexName)}/graph/entities`, {
      method: "POST",
      headers,
      body: JSON.stringify({ entities }),
    });
    if (!res.ok) throw new Error(`Failed to add graph entities: ${await res.text()}`);
    return (await res.json()) as { added: number };
  }

  async addTriples(indexName: string, triples: GraphTriple[]): Promise<{ added: number }> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/indexes/${encodeURIComponent(indexName)}/graph/triples`, {
      method: "POST",
      headers,
      body: JSON.stringify({ triples }),
    });
    if (!res.ok) throw new Error(`Failed to add graph triples: ${await res.text()}`);
    return (await res.json()) as { added: number };
  }

  async getNeighborhood(
    indexName: string,
    entityId: string,
    options: { maxHops?: number } = {}
  ): Promise<GraphNeighborhood> {
    const headers = await this.tokenManager.getAuthHeaders();
    const maxHops = options.maxHops || 1;
    const res = await fetch(
      `${this.baseUrl}/v1/indexes/${encodeURIComponent(indexName)}/graph/entities/${encodeURIComponent(entityId)}?maxHops=${maxHops}`,
      { headers }
    );
    if (!res.ok) throw new Error(`Failed to fetch graph neighborhood: ${await res.text()}`);
    return (await res.json()) as GraphNeighborhood;
  }

  async search(
    indexName: string,
    query: string,
    options: { maxHops?: number; types?: string[]; limit?: number } = {}
  ): Promise<GraphSearchResult> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/indexes/${encodeURIComponent(indexName)}/graph/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, ...options }),
    });
    if (!res.ok) throw new Error(`Graph search failed: ${await res.text()}`);
    return (await res.json()) as GraphSearchResult;
  }

  async getStats(indexName: string): Promise<{ totalEntities: number; totalTriples: number; entityTypes: Record<string, number> }> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/indexes/${encodeURIComponent(indexName)}/graph/stats`, { headers });
    if (!res.ok) throw new Error(`Failed to fetch graph stats: ${await res.text()}`);
    const data = (await res.json()) as { stats: { totalEntities: number; totalTriples: number; entityTypes: Record<string, number> } };
    return data.stats;
  }
}
