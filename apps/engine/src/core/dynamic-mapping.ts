/**
 * Infer and expand index field mappings from document values (no ML).
 */
import type { FieldMapping } from "../types.js";

const KEYWORD_HINTS = new Set([
  "url",
  "final_url",
  "canonical",
  "canonical_url",
  "host",
  "path",
  "category",
  "categories",
  "tags",
  "tag",
  "roles",
  "role",
  "lang",
  "language",
  "locale",
  "content_type",
  "contenttype",
  "site",
  "site_name",
  "sitename",
  "author",
  "section",
  "type",
  "page_type",
  "pagetype",
  "source",
  "status_text",
  "og_type",
]);

const TEXT_HINTS = new Set([
  "title",
  "body",
  "text",
  "description",
  "summary",
  "content",
  "headings",
  "h1",
  "keywords",
]);

const NUMBER_HINTS = new Set([
  "status",
  "depth",
  "word_count",
  "wordcount",
  "link_count",
  "linkcount",
  "price",
  "score",
]);

const DATE_HINTS = new Set(["fetched_at", "published_at", "updated_at", "created_at", "date"]);

function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return false;
  return Number.isFinite(Date.parse(s));
}

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || (s.startsWith("/") && !s.includes(" "));
}

function isGeoPoint(v: unknown): boolean {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.lat === "number" && typeof (o.lon ?? o.lng) === "number";
}

export function inferFieldMapping(field: string, value: unknown): FieldMapping | null {
  if (value === undefined || value === null) return null;
  const key = field.toLowerCase().replace(/[^a-z0-9_]/g, "_");

  if (isGeoPoint(value)) return { type: "geo_point" };
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number" && Number.isFinite(value)) return { type: "number" };

  if (Array.isArray(value)) {
    // [lon, lat] — prefer geo when field name suggests it
    if (
      value.length === 2 &&
      value.every((x) => typeof x === "number") &&
      /loc|geo|coord|point/i.test(field)
    ) {
      return { type: "geo_point" };
    }
    if (value.every((x) => typeof x === "string")) return { type: "keyword" };
    if (value.every((x) => typeof x === "number")) return { type: "number" };
    return { type: "text" };
  }

  if (typeof value === "string") {
    if (DATE_HINTS.has(key) || isIsoDate(value)) return { type: "date" };
    if (NUMBER_HINTS.has(key) && /^-?\d+(\.\d+)?$/.test(value.trim())) return { type: "number" };
    if (KEYWORD_HINTS.has(key) || looksLikeUrl(value)) return { type: "keyword" };
    if (TEXT_HINTS.has(key)) return { type: "text" };
    if (value.length <= 64 && !/\s/.test(value.trim())) return { type: "keyword" };
    if (value.length <= 80 && value.split(/\s+/).length <= 4) return { type: "keyword" };
    return { type: "text" };
  }

  return null;
}

/** Coerce arrays into indexable scalars before storage. */
export function coerceFieldValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    // Preserve [lon, lat] geo points for mapped geo_point fields
    if (value.length === 2 && value.every((x) => typeof x === "number")) {
      return value;
    }
    if (value.every((x) => typeof x === "string")) return value.join(" ");
    if (value.every((x) => typeof x === "number")) return value[0];
    return value.map(String).join(" ");
  }
  return value;
}

export function coerceDocumentFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "object" && !Array.isArray(v) && !isGeoPoint(v)) continue;
    out[k] = coerceFieldValue(v);
  }
  return out;
}

/**
 * Add missing mappings from sample field values. Mutates `mappings`.
 * Returns newly added field names.
 */
export function expandMappingsFromFields(
  mappings: Record<string, FieldMapping>,
  fields: Record<string, unknown>,
): string[] {
  const added: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (mappings[key]) continue;
    const inferred = inferFieldMapping(key, value);
    if (!inferred) continue;
    mappings[key] = inferred;
    added.push(key);
  }
  return added;
}
