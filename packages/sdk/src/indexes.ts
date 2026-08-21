import type { TokenManager } from "./auth.js";
import type { FieldMapping, IndexDefinition, IndexSettings } from "./types.js";

export class IndexesClient {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenManager: TokenManager
  ) {}

  async list(): Promise<IndexDefinition[]> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/indexes`, { headers });
    if (!res.ok) throw new Error(`Failed to list indexes: ${await res.text()}`);
    const data = (await res.json()) as { ok: boolean; indexes: IndexDefinition[] };
    return data.indexes;
  }

  async get(name: string): Promise<IndexDefinition> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/indexes/${encodeURIComponent(name)}`, { headers });
    if (!res.ok) throw new Error(`Index '${name}' not found: ${await res.text()}`);
    const data = (await res.json()) as { ok: boolean; index: IndexDefinition };
    return data.index;
  }

  async create(options: {
    name: string;
    mappings?: Record<string, FieldMapping>;
    settings?: IndexSettings;
  }): Promise<IndexDefinition> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/indexes`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: options.name,
        mappings: options.mappings || {},
        settings: options.settings || {},
      }),
    });
    if (!res.ok) throw new Error(`Failed to create index '${options.name}': ${await res.text()}`);
    const data = (await res.json()) as { ok: boolean; index: IndexDefinition };
    return data.index;
  }

  async delete(name: string): Promise<boolean> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/indexes/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers,
    });
    if (!res.ok) throw new Error(`Failed to delete index '${name}': ${await res.text()}`);
    return true;
  }

  async suggest(name: string, prefix: string, options: { field?: string; size?: number } = {}): Promise<string[]> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/indexes/${encodeURIComponent(name)}/suggest`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prefix, ...options }),
    });
    if (!res.ok) throw new Error(`Suggest failed: ${await res.text()}`);
    const data = (await res.json()) as { ok: boolean; suggestions: string[] };
    return data.suggestions;
  }

  async autocomplete(
    name: string,
    query: string,
    options: {
      fields?: string[];
      size?: number;
      includeCategories?: boolean;
      includeDocuments?: boolean;
      includeVisualTags?: boolean;
      includeGraphEntities?: boolean;
    } = {}
  ): Promise<import("./types.js").AutocompleteSuggestion[]> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/indexes/${encodeURIComponent(name)}/autocomplete`, {
      method: "POST",
      headers,
      body: JSON.stringify({ q: query, ...options }),
    });
    if (!res.ok) throw new Error(`Autocomplete failed: ${await res.text()}`);
    const data = (await res.json()) as { ok: boolean; suggestions: import("./types.js").AutocompleteSuggestion[] };
    return data.suggestions;
  }
}
