import { unsupported } from "../errors.js";
import type { AnveshSearchQuery, AnveshSearchHit, AnveshSearchResult } from "../types.js";

function escapeSolr(value: string): string {
  return value.replace(/([+\-!():^"[\]{}~*?\\])/g, "\\$1");
}

function termFilter(field: string, value: string | number | boolean): string {
  const v = typeof value === "string" ? `"${escapeSolr(value)}"` : String(value);
  return `${field}:${v}`;
}

function rangeFilter(filter: {
  field: string;
  gte?: number | string;
  lte?: number | string;
  gt?: number | string;
  lt?: number | string;
}): string {
  const start = filter.gte ?? filter.gt ?? "*";
  const end = filter.lte ?? filter.lt ?? "*";
  const left = filter.gt !== undefined ? "{" : "[";
  const right = filter.lt !== undefined ? "}" : "]";
  return `${filter.field}:${left}${start} TO ${end}${right}`;
}

function isRangeFilter(
  filter: NonNullable<AnveshSearchQuery["filters"]>[number],
): filter is {
  field: string;
  gte?: number | string;
  lte?: number | string;
  gt?: number | string;
  lt?: number | string;
} {
  return "gte" in filter || "lte" in filter || "gt" in filter || "lt" in filter;
}

export function assertSolrSupported(query: AnveshSearchQuery): void {
  if (query.vector?.length) unsupported("vector search", "solr");
  if (query.mode === "semantic" || query.mode === "hybrid" || query.mode === "geo") {
    unsupported(`mode=${query.mode}`, "solr");
  }
  if (query.must?.length || query.should?.length || query.mustNot?.length) {
    unsupported("must/should/mustNot bool clauses", "solr");
  }
}

export function mapAnveshQueryToSolr(query: AnveshSearchQuery): Record<string, string | number | boolean> {
  assertSolrSupported(query);

  const params: Record<string, string | number | boolean> = {
    wt: "json",
    start: query.from ?? 0,
    rows: query.size ?? 10,
    defType: "edismax",
  };

  if (query.q) {
    if (query.phrase) {
      params.q = `"${escapeSolr(query.q)}"`;
    } else if (query.prefix) {
      params.q = `${escapeSolr(query.q)}*`;
    } else if (query.fuzziness !== undefined && query.fuzziness !== false) {
      const dist = query.fuzziness === "AUTO" ? 2 : Number(query.fuzziness);
      params.q = `${escapeSolr(query.q)}~${dist}`;
    } else {
      params.q = query.q;
    }
  } else {
    params.q = "*:*";
  }

  if (query.fields?.length) {
    params.qf = query.fields.join(" ");
  }

  if (query.boosts && Object.keys(query.boosts).length) {
    params.qf = Object.entries(query.boosts)
      .map(([field, boost]) => `${field}^${boost}`)
      .join(" ");
  }

  const fq: string[] = [];
  for (const f of query.filters ?? []) {
    fq.push(isRangeFilter(f) ? rangeFilter(f) : termFilter(f.field, f.value));
  }
  if (fq.length) params.fq = fq.join(" AND ");

  const projSpec = query.projection ?? query.select ?? query.returnFields ?? query._source;
  if (projSpec !== undefined) {
    if (Array.isArray(projSpec)) {
      params.fl = ["id", ...projSpec.filter((f) => f !== "id" && f !== "_id")].join(",");
    } else if (typeof projSpec === "string") {
      params.fl = projSpec;
    } else if (typeof projSpec === "object" && projSpec !== null) {
      if ("includes" in projSpec && Array.isArray((projSpec as any).includes)) {
        params.fl = ["id", ...(projSpec as any).includes].join(",");
      } else {
        const includes = Object.entries(projSpec)
          .filter(([_, v]) => v === 1 || v === true || v === "1" || v === "true")
          .map(([k]) => k);
        if (includes.length) {
          params.fl = ["id", ...includes.filter((f) => f !== "id" && f !== "_id")].join(",");
        }
      }
    }
  }

  return params;
}

export function mapSolrSearchResponse(json: unknown, tookMs = 0): AnveshSearchResult {
  const root = (json ?? {}) as Record<string, unknown>;
  const response = (root.response ?? {}) as Record<string, unknown>;
  const docs = Array.isArray(response.docs) ? response.docs : [];
  const total = Number(response.numFound ?? 0);
  const hits: AnveshSearchHit[] = docs.map((doc) => {
    const d = { ...(doc as Record<string, unknown>) };
    const id = String(d.id ?? d._root_ ?? "");
    delete d._version_;
    delete d._root_;
    return {
      id,
      score: Number(d.score ?? 0),
      source: { id, fields: d },
    };
  });
  return {
    tookMs,
    total,
    hits,
    message: `Search completed — ${total} hit(s).`,
  };
}
