/**
 * Dynamic field inference + crawl metadata enrichment (no ML).
 * VaagaTech · Anvesh
 */
import type { FieldMapping } from "./types.js";

export type MappingType = FieldMapping["type"];

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
  const t = Date.parse(s);
  return Number.isFinite(t);
}

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || (s.startsWith("/") && !s.includes(" "));
}

function isGeoPoint(v: unknown): boolean {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.lat === "number" && typeof (o.lon ?? o.lng) === "number";
}

/** Infer a single field mapping from a sample value + field name. */
export function inferFieldMapping(field: string, value: unknown): FieldMapping | null {
  if (value === undefined || value === null) return null;
  const key = field.toLowerCase().replace(/[^a-z0-9_]/g, "_");

  if (isGeoPoint(value)) return { type: "geo_point" };
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number" && Number.isFinite(value)) return { type: "number" };

  if (Array.isArray(value)) {
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
    // short token-like → keyword; longer prose → text
    if (value.length <= 64 && !/\s/.test(value.trim())) return { type: "keyword" };
    if (value.length <= 80 && value.split(/\s+/).length <= 4) return { type: "keyword" };
    return { type: "text" };
  }

  if (typeof value === "object") {
    // flatten-friendly: store as keyword JSON is poor — skip nested objects
    return null;
  }

  return { type: "keyword" };
}

/**
 * Merge inferred mappings into existing ones.
 * Never downgrades an existing explicit mapping; only adds missing fields.
 * Returns list of newly added field names.
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

/** Coerce common array/metadata values into indexable scalars. */
export function normalizeFieldValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length === 2 && value.every((x) => typeof x === "number")) return value;
    if (value.every((x) => typeof x === "string")) return value.join(" ");
    if (value.every((x) => typeof x === "number")) return value[0];
    return value.map(String).join(" ");
  }
  return value;
}

export function normalizeDocumentFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "object" && !Array.isArray(v) && !isGeoPoint(v)) continue;
    out[k] = normalizeFieldValue(v);
  }
  return out;
}

/** Heuristic page category from URL path + title tokens. */
export function inferCategory(url: string, title = "", keywords: string[] = []): string {
  let path = "/";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = url.toLowerCase();
  }

  const hay = `${path} ${title.toLowerCase()} ${keywords.join(" ").toLowerCase()}`;

  const rules: Array<[RegExp, string]> = [
    [/\/(blog|posts?|articles?|news|stories)\b/, "blog"],
    [/\/(docs?|documentation|guide|manual|reference|api)\b/, "docs"],
    [/\/(products?|shop|store|catalog|pricing|item)\b/, "product"],
    [/\/(about|company|team|careers|jobs)\b/, "about"],
    [/\/(contact|support|help|faq)\b/, "support"],
    [/\/(login|signin|signup|register|account|auth)\b/, "auth"],
    [/\/(search|results)\b/, "search"],
    [/\/(home)?\/?$/, "home"],
  ];
  for (const [re, cat] of rules) {
    if (re.test(hay)) return cat;
  }

  const seg = path.split("/").filter(Boolean)[0];
  if (seg && /^[a-z0-9_-]{2,32}$/i.test(seg)) return seg;
  return "page";
}

export function inferPageType(opts: {
  path: string;
  contentType?: string;
  hasArticle?: boolean;
}): string {
  const ct = (opts.contentType ?? "").toLowerCase();
  if (ct.includes("xml") || opts.path.endsWith(".xml")) return "feed";
  if (opts.hasArticle) return "article";
  if (/\/(docs?|guide)\b/i.test(opts.path)) return "documentation";
  if (opts.path === "/" || opts.path === "") return "landing";
  return "webpage";
}

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function pathFromUrl(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
