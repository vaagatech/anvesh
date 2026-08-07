import { AdapterUnsupportedError, unsupported } from "../errors.js";
import type { AnveshSearchQuery, AnveshSearchHit, AnveshSearchResult } from "../types.js";

type EsClause = Record<string, unknown>;

function termClause(field: string, value: string | number | boolean): EsClause {
  return { term: { [field]: value } };
}

function rangeClause(filter: {
  field: string;
  gte?: number | string;
  lte?: number | string;
  gt?: number | string;
  lt?: number | string;
}): EsClause {
  const range: Record<string, number | string> = {};
  if (filter.gte !== undefined) range.gte = filter.gte;
  if (filter.lte !== undefined) range.lte = filter.lte;
  if (filter.gt !== undefined) range.gt = filter.gt;
  if (filter.lt !== undefined) range.lt = filter.lt;
  return { range: { [filter.field]: range } };
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

export function assertElasticsearchSupported(query: AnveshSearchQuery, backend = "elasticsearch"): void {
  if (query.vector?.length) unsupported("vector search", backend);
  if (query.mode === "semantic" || query.mode === "hybrid" || query.mode === "geo") {
    unsupported(`mode=${query.mode}`, backend);
  }
}

export function mapAnveshQueryToElasticsearch(query: AnveshSearchQuery): Record<string, unknown> {
  assertElasticsearchSupported(query);

  const must: EsClause[] = [];
  const should: EsClause[] = [];
  const mustNot: EsClause[] = [];
  const filter: EsClause[] = [];

  if (query.q) {
    const fields = query.fields?.length ? query.fields : ["*"];
    if (query.phrase) {
      const field = fields.length === 1 && fields[0] !== "*" ? fields[0] : undefined;
      if (field) {
        must.push({
          match_phrase: {
            [field]: { query: query.q, slop: query.phraseSlop ?? 0 },
          },
        });
      } else {
        must.push({
          multi_match: {
            query: query.q,
            fields,
            type: "phrase",
            slop: query.phraseSlop ?? 0,
          },
        });
      }
    } else if (query.prefix) {
      for (const field of fields) {
        must.push({ prefix: { [field === "*" ? "_all" : field]: query.q } });
      }
    } else {
      const bestFields: Record<string, unknown> = {
        query: query.q,
        fields,
        type: "best_fields",
      };
      if (query.fuzziness !== undefined && query.fuzziness !== false) {
        bestFields.fuzziness = query.fuzziness;
      }
      if (query.boosts) {
        bestFields.fields = fields.map((f) => {
          const boost = query.boosts?.[f];
          return boost != null ? `${f}^${boost}` : f;
        });
      }

      // Add phrase exact match boost to bump relevance of literal keyword phrases
      const phraseMatch: Record<string, unknown> = {
        query: query.q,
        fields: bestFields.fields ?? fields,
        type: "phrase",
        boost: 10,
      };

      must.push({
        bool: {
          must: [{ multi_match: bestFields }],
          should: [{ multi_match: phraseMatch }],
        },
      });
    }
  }

  for (const clause of query.must ?? []) must.push(termClause(clause.field, clause.value));
  for (const clause of query.should ?? []) should.push(termClause(clause.field, clause.value));
  for (const clause of query.mustNot ?? []) mustNot.push(termClause(clause.field, clause.value));

  for (const f of query.filters ?? []) {
    filter.push(isRangeFilter(f) ? rangeClause(f) : termClause(f.field, f.value));
  }

  const bool: Record<string, EsClause[]> = {};
  if (must.length) bool.must = must;
  if (should.length) bool.should = should;
  if (mustNot.length) bool.must_not = mustNot;
  if (filter.length) bool.filter = filter;

  const body: Record<string, unknown> = {
    from: query.from ?? 0,
    size: query.size ?? 10,
  };

  if (Object.keys(bool).length) {
    body.query = { bool };
  } else {
    body.query = { match_all: {} };
  }

  return body;
}

export function mapElasticsearchSearchResponse(json: unknown, tookMs = 0): AnveshSearchResult {
  const root = (json ?? {}) as Record<string, unknown>;
  const hitsRoot = (root.hits ?? {}) as Record<string, unknown>;
  const totalRaw = hitsRoot.total;
  const total =
    typeof totalRaw === "number"
      ? totalRaw
      : typeof totalRaw === "object" && totalRaw && "value" in totalRaw
        ? Number((totalRaw as { value: number }).value)
        : 0;
  const hitsArr = Array.isArray(hitsRoot.hits) ? hitsRoot.hits : [];
  const hits: AnveshSearchHit[] = hitsArr.map((hit) => {
    const h = hit as Record<string, unknown>;
    const source = (h._source ?? {}) as Record<string, unknown>;
    const id = String(h._id ?? source.id ?? "");
    return {
      id,
      score: Number(h._score ?? 0),
      source: { id, fields: source },
      highlight: h.highlight as Record<string, string[]> | undefined,
    };
  });
  return {
    tookMs: Number(root.took ?? tookMs),
    total,
    hits,
    message: `Search completed — ${total} hit(s).`,
  };
}

export function mapAnveshFieldToElasticsearch(type: string): Record<string, unknown> {
  switch (type) {
    case "text":
      return { type: "text" };
    case "keyword":
      return { type: "keyword" };
    case "number":
      return { type: "double" };
    case "boolean":
      return { type: "boolean" };
    case "date":
      return { type: "date" };
    case "geo_point":
      return { type: "geo_point" };
    case "vector":
      throw new AdapterUnsupportedError("vector field mappings require kNN configuration on Elasticsearch");
    default:
      return { type: "text" };
  }
}

export function mapAnveshMappingsToElasticsearch(
  mappings: Record<string, { type: string }>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(mappings)) {
    properties[name] = mapAnveshFieldToElasticsearch(def.type);
  }
  return { properties };
}
