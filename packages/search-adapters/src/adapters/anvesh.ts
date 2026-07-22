import { HttpClient } from "../http.js";
import type { AnveshSearchQuery, AnveshSearchResult, IndexInfo, SearchBackend } from "../types.js";

function unwrapIndexes(json: unknown): IndexInfo[] {
  const root = json as Record<string, unknown>;
  const rows = Array.isArray(root.indexes) ? root.indexes : [];
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      name: String(r.name ?? ""),
      docCount: typeof r.docCount === "number" ? r.docCount : undefined,
      mappings: r.mappings as Record<string, { type: string }> | undefined,
      settings: r.settings as Record<string, unknown> | undefined,
    };
  });
}

export function createAnveshAdapter(client: HttpClient): SearchBackend {
  return {
    kind: "anvesh",
    async health() {
      const res = await client.get("/health");
      return res.ok;
    },
    async listIndexes() {
      const res = await client.get("/v1/indexes");
      if (!res.ok) throw new Error(`Anvesh listIndexes failed (${res.status})`);
      return unwrapIndexes(res.json);
    },
    async createIndex(def) {
      const res = await client.post("/v1/indexes", def);
      if (!res.ok) throw new Error(`Anvesh createIndex failed (${res.status})`);
    },
    async deleteIndex(name) {
      const res = await client.delete(`/v1/indexes/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error(`Anvesh deleteIndex failed (${res.status})`);
    },
    async bulk(index, docs) {
      const res = await client.post(`/v1/indexes/${encodeURIComponent(index)}/documents/_bulk`, {
        documents: docs,
      });
      if (!res.ok) throw new Error(`Anvesh bulk failed (${res.status})`);
      const body = res.json as Record<string, unknown>;
      return {
        indexed: Number(body.indexed ?? docs.length),
        failed: Number(body.failed ?? 0),
      };
    },
    async search(index, query: AnveshSearchQuery): Promise<AnveshSearchResult> {
      const started = Date.now();
      const res = await client.post(
        `/v1/indexes/${encodeURIComponent(index)}/search`,
        query,
      );
      if (!res.ok) throw new Error(`Anvesh search failed (${res.status})`);
      const body = res.json as Record<string, unknown>;
      const hitsRaw = Array.isArray(body.hits) ? body.hits : [];
      return {
        tookMs: Number(body.tookMs ?? Date.now() - started),
        total: Number(body.total ?? hitsRaw.length),
        hits: hitsRaw as AnveshSearchResult["hits"],
        message: String(body.message ?? "Search completed."),
      };
    },
  };
}
