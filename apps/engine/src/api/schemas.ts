import { z } from "zod";

export const fieldMappingSchema = z.object({
  type: z.enum(["text", "keyword", "number", "boolean", "date", "vector", "geo_point"]),
  store: z.boolean().optional(),
  index: z.boolean().optional(),
  analyzer: z.string().optional(),
});

export const createIndexSchema = z.object({
  name: z.string().min(1).max(64),
  /** Optional — empty `{}` is valid when dynamicMapping is on (default). */
  mappings: z.record(fieldMappingSchema).default({}),
  settings: z
    .object({
      bm25k1: z.number().positive().optional(),
      bm25b: z.number().min(0).max(1).optional(),
      vectorDimensions: z.number().int().positive().optional(),
      vectorMetric: z.enum(["cosine", "dot_product", "euclidean"]).optional(),
      vectorIndexType: z.enum(["flat", "hnsw"]).optional(),
      vectorQuantization: z.enum(["none", "sq8"]).optional(),
      autoEmbed: z.boolean().optional(),
      hybridKeywordWeight: z.number().min(0).max(1).optional(),
      rrfK: z.number().int().positive().optional(),
      hybridRankingMode: z.enum(["linear", "rrf"]).optional(),
      queryCacheSize: z.number().int().nonnegative().optional(),
      softMaxDocs: z.number().int().positive().optional(),
      dynamicMapping: z.boolean().optional(),
    })
    .optional(),
});

export const indexDocumentSchema = z.object({
  id: z.string().min(1).optional(),
  fields: z.record(z.unknown()),
  vector: z.array(z.number()).optional(),
  meta: z.record(z.unknown()).optional(),
});

export const bulkIndexSchema = z.object({
  documents: z.array(indexDocumentSchema).min(1).max(1000),
});

const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const geoQuerySchema = z.object({
  field: z.string().min(1),
  origin: geoPointSchema.optional(),
  distanceKm: z.number().min(0).optional(),
  boundingBox: z
    .object({
      top: z.number(),
      left: z.number(),
      bottom: z.number(),
      right: z.number(),
    })
    .optional(),
  sortByDistance: z.boolean().optional(),
});


export const boostFilterSchema = z.object({
  field: z.string().min(1),
  equals: z.union([z.string(), z.number(), z.boolean()]).optional(),
  notEquals: z.union([z.string(), z.number(), z.boolean()]).optional(),
  in: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  exists: z.boolean().optional(),
});

export const boostRuleSchema = z.object({
  filter: boostFilterSchema,
  weight: z.number(),
  mode: z.enum(["multiply", "add"]).default("multiply").optional(),
});

export const searchSchema = z.object({
  q: z.string().optional(),
  fields: z.array(z.string()).optional(),
  vector: z.array(z.number()).optional(),
  mode: z.enum(["keyword", "semantic", "hybrid", "geo"]).optional(),
  vectorMetric: z.enum(["cosine", "dot_product", "euclidean"]).optional(),
  hybridRankingMode: z.enum(["linear", "rrf"]).optional(),
  rrfK: z.number().int().positive().optional(),
  filters: z
    .array(
      z.union([
        z.object({ field: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }),
        z.object({
          field: z.string(),
          gte: z.union([z.number(), z.string()]).optional(),
          lte: z.union([z.number(), z.string()]).optional(),
          gt: z.union([z.number(), z.string()]).optional(),
          lt: z.union([z.number(), z.string()]).optional(),
        }),
      ]),
    )
    .optional(),
  geo: geoQuerySchema.optional(),
  from: z.number().int().min(0).optional(),
  size: z.number().int().min(1).max(100).optional(),
  highlight: z.boolean().optional(),
  facets: z.array(z.string()).optional(),
  minScore: z.number().optional(),
  fuzziness: z.union([z.boolean(), z.literal(0), z.literal(1), z.literal(2), z.literal("AUTO")]).optional(),
  phrase: z.boolean().optional(),
  phraseSlop: z.number().int().min(0).max(10).optional(),
  prefix: z.boolean().optional(),
  boosts: z.record(z.number()).optional(),
  boostRules: z.array(boostRuleSchema).optional(),
  functions: z.array(boostRuleSchema).optional(),
  searchAfter: z.string().optional(),
  must: z
    .array(z.object({ field: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }))
    .optional(),
  should: z
    .array(z.object({ field: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }))
    .optional(),
  mustNot: z
    .array(z.object({ field: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }))
    .optional(),
  projection: z
    .union([
      z.record(z.union([z.number(), z.boolean(), z.string()])),
      z.array(z.string()),
      z.string(),
      z.boolean(),
      z.object({
        includes: z.array(z.string()).optional(),
        excludes: z.array(z.string()).optional(),
      }),
    ])
    .optional(),
  select: z
    .union([
      z.array(z.string()),
      z.string(),
      z.record(z.union([z.number(), z.boolean(), z.string()])),
    ])
    .optional(),
  _source: z
    .union([
      z.boolean(),
      z.array(z.string()),
      z.string(),
      z.object({
        includes: z.array(z.string()).optional(),
        excludes: z.array(z.string()).optional(),
      }),
    ])
    .optional(),
  returnFields: z.array(z.string()).optional(),
  includeFields: z.array(z.string()).optional(),
  excludeFields: z.array(z.string()).optional(),
});

export const suggestSchema = z.object({
  prefix: z.string().min(1),
  field: z.string().optional(),
  size: z.number().int().min(1).max(50).optional(),
});

export const updateByQuerySchema = z.object({
  filters: z
    .array(
      z.union([
        z.object({ field: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }),
        z.object({
          field: z.string(),
          gte: z.union([z.number(), z.string()]).optional(),
          lte: z.union([z.number(), z.string()]).optional(),
          gt: z.union([z.number(), z.string()]).optional(),
          lt: z.union([z.number(), z.string()]).optional(),
        }),
      ]),
    )
    .optional(),
  set: z.record(z.unknown()).refine((o) => Object.keys(o).length > 0, {
    message: "set must include at least one field",
  }),
  maxDocs: z.number().int().min(1).max(1000).optional(),
});

export const autocompleteSchema = z.object({
  q: z.string().min(1),
  fields: z.array(z.string()).optional(),
  size: z.number().int().min(1).max(50).optional(),
  includeCategories: z.boolean().optional(),
  includeDocuments: z.boolean().optional(),
  includeVisualTags: z.boolean().optional(),
  includeGraphEntities: z.boolean().optional(),
});

export const imageMetadataSchema = z.object({
  image: z.string().optional(),
  bufferBase64: z.string().optional(),
}).refine((data) => Boolean(data.image || data.bufferBase64), {
  message: "Either 'image' URL or 'bufferBase64' string must be provided.",
});

export const graphEntitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  properties: z.record(z.unknown()).optional(),
  docIds: z.array(z.string()).optional(),
});

export const graphEntitiesSchema = z.object({
  entities: z.array(graphEntitySchema).min(1),
});

export const graphTripleSchema = z.object({
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  weight: z.number().optional(),
});

export const graphTriplesSchema = z.object({
  triples: z.array(graphTripleSchema).min(1),
});

export const graphSearchSchema = z.object({
  query: z.string().min(1),
  maxHops: z.number().int().min(1).max(5).optional(),
  types: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

