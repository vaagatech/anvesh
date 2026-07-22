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
      autoEmbed: z.boolean().optional(),
      hybridKeywordWeight: z.number().min(0).max(1).optional(),
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

export const searchSchema = z.object({
  q: z.string().optional(),
  fields: z.array(z.string()).optional(),
  vector: z.array(z.number()).optional(),
  mode: z.enum(["keyword", "semantic", "hybrid", "geo"]).optional(),
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
