import type { TokenManager } from "./auth.js";
import type { AnveshDocument, BulkIndexItem, BulkIndexResult, DocumentId } from "./types.js";

export class DocumentsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenManager: TokenManager
  ) {}

  async get<T = Record<string, any>>(index: string, id: DocumentId): Promise<AnveshDocument<T>> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(
      `${this.baseUrl}/v1/indexes/${encodeURIComponent(index)}/documents/${encodeURIComponent(id)}`,
      { headers }
    );
    if (!res.ok) throw new Error(`Document '${id}' in index '${index}' not found: ${await res.text()}`);
    const data = (await res.json()) as { ok: boolean; document: AnveshDocument<T> };
    return data.document;
  }

  async index<T = Record<string, any>>(
    index: string,
    document: {
      id: DocumentId;
      fields: Record<string, any>;
      meta?: T;
    }
  ): Promise<boolean> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(
      `${this.baseUrl}/v1/indexes/${encodeURIComponent(index)}/documents/${encodeURIComponent(document.id)}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify(document),
      }
    );
    if (!res.ok) throw new Error(`Failed to index document '${document.id}': ${await res.text()}`);
    return true;
  }

  async bulk(index: string, items: BulkIndexItem[]): Promise<BulkIndexResult> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(
      `${this.baseUrl}/v1/indexes/${encodeURIComponent(index)}/documents/_bulk`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ items }),
      }
    );
    if (!res.ok) throw new Error(`Bulk indexing failed: ${await res.text()}`);
    const data = (await res.json()) as { ok: boolean; result: BulkIndexResult };
    return data.result;
  }

  async delete(index: string, id: DocumentId): Promise<boolean> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(
      `${this.baseUrl}/v1/indexes/${encodeURIComponent(index)}/documents/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers,
      }
    );
    if (!res.ok) throw new Error(`Failed to delete document '${id}': ${await res.text()}`);
    return true;
  }
}
