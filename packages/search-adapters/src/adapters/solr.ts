import { HttpClient } from "../http.js";
import { mapAnveshQueryToSolr, mapSolrSearchResponse } from "../mappers/solr.js";
import type { SearchBackend } from "../types.js";

function solrCorePath(core: string, suffix: string): string {
  const trimmed = core.replace(/^\//, "");
  if (trimmed.includes("/")) return `/${trimmed}${suffix}`;
  return `/solr/${trimmed}${suffix}`;
}

export function createSolrAdapter(client: HttpClient): SearchBackend {
  return {
    kind: "solr",
    async health() {
      const res = await client.get("/admin/ping?wt=json");
      if (res.ok) return true;
      const alt = await client.get("/solr/admin/ping?wt=json");
      return alt.ok;
    },
    async listIndexes() {
      const res = await client.get("/admin/cores?action=STATUS&wt=json");
      const alt = res.ok ? res : await client.get("/solr/admin/cores?action=STATUS&wt=json");
      if (!alt.ok) throw new Error(`solr listIndexes failed (${alt.status})`);
      const status = ((alt.json as Record<string, unknown>).status ?? {}) as Record<
        string,
        Record<string, unknown>
      >;
      return Object.entries(status).map(([name, info]) => ({
        name,
        docCount: info.index ? Number((info.index as Record<string, unknown>).numDocs ?? 0) : undefined,
      }));
    },
    async createIndex(def) {
      const params = new URLSearchParams({
        action: "CREATE",
        name: def.name,
        wt: "json",
      });
      const res = await client.get(`/admin/cores?${params}`);
      const alt = res.ok ? res : await client.get(`/solr/admin/cores?${params}`);
      if (!alt.ok) throw new Error(`solr createIndex failed (${alt.status})`);
    },
    async deleteIndex(name) {
      const params = new URLSearchParams({
        action: "UNLOAD",
        core: name,
        deleteIndex: "true",
        wt: "json",
      });
      const res = await client.get(`/admin/cores?${params}`);
      const alt = res.ok ? res : await client.get(`/solr/admin/cores?${params}`);
      if (!alt.ok) throw new Error(`solr deleteIndex failed (${alt.status})`);
    },
    async bulk(core, docs) {
      const path = solrCorePath(core, "/update/json?commit=true&wt=json");
      const res = await client.post(path, docs);
      if (!res.ok) throw new Error(`solr bulk failed (${res.status})`);
      return { indexed: docs.length, failed: 0 };
    },
    async search(core, query) {
      const started = Date.now();
      const params = mapAnveshQueryToSolr(query);
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
      const path = `${solrCorePath(core, "/select")}?${qs}`;
      const res = await client.get(path);
      if (!res.ok) throw new Error(`solr search failed (${res.status})`);
      return mapSolrSearchResponse(res.json, Date.now() - started);
    },
  };
}
