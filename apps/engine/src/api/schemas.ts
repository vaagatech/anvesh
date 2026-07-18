import { z } from "zod";

export const fieldMappingSchema = z.object({
  type: z.enum(["text", "keyword", "number", "boolean", "date", "vector", "geo_point"]),
  store: z.boolean().optional(),
  index: z.boolean().optional(),
  analyzer: z.string().optional(),
});

export const createIndexSchema = z.object({
  name: z.string().min(1).max(64),
  mappings: z.record(fieldMappingSchema),
  settings: z
    .object({
      bm25k1: z.number().positive().optional(),
      bm25b: z.number().min(0).max(1).optional(),
      vectorDimensions: z.number().int().positive().optional(),
      hybridKeywordWeight: z.number().min(0).max(1).optional(),
      softMaxDocs: z.number().int().positive().optional(),
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
});
