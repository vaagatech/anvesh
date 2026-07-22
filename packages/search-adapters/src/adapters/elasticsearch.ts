import { HttpClient } from "../http.js";
import {
  mapAnveshMappingsToElasticsearch,
  mapAnveshQueryToElasticsearch,
  mapElasticsearchSearchResponse,
} from "../mappers/elasticsearch.js";
import type { SearchBackendKind, SearchBackend } from "../types.js";

export function createElasticsearchAdapter(
  client: HttpClient,
  kind: Extract<SearchBackendKind, "elasticsearch" | "opensearch">,
): SearchBackend {
  return {
    kind,
    async health() {
      const res = await client.get("/_cluster/health");
      if (res.ok) return true;
      const ping = await client.get("/");
      return ping.ok;
    },
    async listIndexes() {
      const res = await client.get("/_cat/indices?format=json&h=index,docs.count");
      if (!res.ok) throw new Error(`${kind} listIndexes failed (${res.status})`);
      const rows = Array.isArray(res.json) ? res.json : [];
      return rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          name: String(r.index ?? r.i ?? ""),
          docCount: r["docs.count"] != null ? Number(r["docs.count"]) : undefined,
        };
      });
    },
    async createIndex(def) {
      const body = {
        mappings: mapAnveshMappingsToElasticsearch(def.mappings),
        settings: def.settings,
      };
      const res = await client.put(`/${encodeURIComponent(def.name)}`, body);
      if (!res.ok) throw new Error(`${kind} createIndex failed (${res.status})`);
    },
    async deleteIndex(name) {
      const res = await client.delete(`/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error(`${kind} deleteIndex failed (${res.status})`);
    },
    async bulk(index, docs) {
      const lines: string[] = [];
      for (const doc of docs) {
        const action = doc.id
          ? { index: { _index: index, _id: doc.id } }
          : { index: { _index: index } };
        lines.push(JSON.stringify(action));
        lines.push(JSON.stringify(doc.fields));
      }
      const res = await client.request(
        "POST",
        "/_bulk",
        lines.join("\n") + "\n",
        { "content-type": "application/x-ndjson" },
      );
      if (!res.ok) throw new Error(`${kind} bulk failed (${res.status})`);
      const body = res.json as Record<string, unknown>;
      const items = Array.isArray((body.items as unknown[] | undefined)) ? (body.items as unknown[]) : [];
      let failed = 0;
      for (const item of items) {
        const first = Object.values(item as Record<string, unknown>)[0] as Record<string, unknown>;
        if (first?.error) failed += 1;
      }
      return { indexed: docs.length - failed, failed };
    },
    async search(index, query) {
      const started = Date.now();
      const body = mapAnveshQueryToElasticsearch(query);
      const res = await client.post(`/${encodeURIComponent(index)}/_search`, body);
      if (!res.ok) throw new Error(`${kind} search failed (${res.status})`);
      return mapElasticsearchSearchResponse(res.json, Date.now() - started);
    },
  };
}
