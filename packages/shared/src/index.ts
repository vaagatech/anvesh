/**
 * Shared contracts between spider → indexer → engine.
 * VaagaTech · https://www.vaagatech.com
 */
import { z } from "zod";
import {
  hostFromUrl,
  inferCategory,
  inferPageType,
  normalizeDocumentFields,
  pathFromUrl,
  wordCount,
} from "./dynamic.js";

export type { FieldMapping } from "./types.js";
export {
  expandMappingsFromFields,
  hostFromUrl,
  inferCategory,
  inferFieldMapping,
  inferPageType,
  normalizeDocumentFields,
  normalizeFieldValue,
  pathFromUrl,
  wordCount,
} from "./dynamic.js";

export const crawlRoleSchema = z.object({
  /** Role name used for tagging pages (e.g. guest, user, admin). */
  name: z.string().min(1),
  /** When true, crawl without authentication. */
  anonymous: z.boolean().optional(),
  /** HTTP headers applied for this role (Authorization, Cookie, etc.). */
  headers: z.record(z.string()).optional(),
  /** Cookie header string if you already have a session. */
  cookie: z.string().optional(),
  /** Form-based login performed before crawling as this role. */
  login: z
    .object({
      url: z.string().url(),
      method: z.enum(["POST", "GET"]).default("POST"),
      /** Form fields — use {{username}} / {{password}} placeholders if desired. */
      body: z.record(z.string()),
      contentType: z
        .enum(["application/x-www-form-urlencoded", "application/json"])
        .default("application/x-www-form-urlencoded"),
      /** Extra headers for the login request only. */
      headers: z.record(z.string()).optional(),
      username: z.string().optional(),
      password: z.string().optional(),
    })
    .optional(),
});

export type CrawlRole = z.infer<typeof crawlRoleSchema>;

export const spiderConfigSchema = z.object({
  seeds: z.array(z.string().url()).min(1),
  allowedHosts: z.array(z.string()).optional(),
  allowPathPrefixes: z.array(z.string()).optional(),
  denyPathPatterns: z.array(z.string()).optional(),
  maxPages: z.number().int().min(0).default(500),
  maxDepth: z.number().int().min(0).default(8),
  concurrency: z.number().int().positive().default(5),
  delayMs: z.number().int().min(0).default(200),
  respectRobotsTxt: z.boolean().default(true),
  followSitemaps: z.boolean().default(true),
  userAgent: z.string().default("AnveshSpider/0.1 (+https://www.vaagatech.com)"),
  requestTimeoutMs: z.number().int().positive().default(20000),
  roles: z
    .array(crawlRoleSchema)
    .min(1)
    .default([{ name: "guest", anonymous: true }]),
  indexName: z.string().optional(),
  outputPath: z.string().optional(),
  /** When true (default), spider pushes pages to an indexer after crawl (no file step). */
  autoIndex: z.boolean().default(true).optional(),
});

export type SpiderConfig = z.infer<typeof spiderConfigSchema>;

export interface CrawledPage {
  url: string;
  finalUrl: string;
  status: number;
  title: string;
  text: string;
  description?: string;
  links: string[];
  /** Roles that successfully fetched this page (HTTP 2xx). */
  roles: string[];
  depth: number;
  fetchedAt: string;
  contentType?: string;
  /** Structured metadata extracted from HTML (heuristic, not ML). */
  lang?: string;
  canonical?: string;
  author?: string;
  keywords?: string[];
  headings?: string[];
  siteName?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogType?: string;
  publishedAt?: string;
  hasArticle?: boolean;
  category?: string;
  pageType?: string;
}

export interface IndexDocumentPayload {
  id?: string;
  fields: Record<string, unknown>;
  vector?: number[];
  meta?: Record<string, unknown>;
}

/**
 * Preferred seed mappings for web crawl indexes.
 * Schema is optional at create time — with dynamicMapping the engine learns extra fields on ingest.
 */
export const WEB_MAPPINGS = {
  title: { type: "text" as const },
  body: { type: "text" as const },
  url: { type: "keyword" as const },
  description: { type: "text" as const },
  roles: { type: "keyword" as const },
  status: { type: "number" as const },
  host: { type: "keyword" as const },
  path: { type: "keyword" as const },
  category: { type: "keyword" as const },
  page_type: { type: "keyword" as const },
  lang: { type: "keyword" as const },
  canonical: { type: "keyword" as const },
  author: { type: "keyword" as const },
  site_name: { type: "keyword" as const },
  content_type: { type: "keyword" as const },
  keywords: { type: "text" as const },
  headings: { type: "text" as const },
  word_count: { type: "number" as const },
  link_count: { type: "number" as const },
  depth: { type: "number" as const },
  published_at: { type: "date" as const },
  og_type: { type: "keyword" as const },
};

export const WEB_SETTINGS = {
  vectorDimensions: 256,
  autoEmbed: true,
  /** Learn new fields from documents (default on in engine too). */
  dynamicMapping: true,
};

/** Map a crawled page into an engine document with enriched metadata. */
export function crawledPageToDocument(page: CrawledPage): IndexDocumentPayload {
  const url = page.finalUrl || page.url;
  const host = hostFromUrl(url);
  const path = pathFromUrl(url);
  const keywords = page.keywords ?? [];
  const title = page.title || page.ogTitle || "";
  const description = page.description || page.ogDescription || "";
  const category = page.category ?? inferCategory(url, title, keywords);
  const pageType =
    page.pageType ??
    inferPageType({
      path,
      contentType: page.contentType,
      hasArticle: page.hasArticle,
    });

  const fields: Record<string, unknown> = {
    title,
    body: page.text,
    url,
    description,
    roles: page.roles.join(" "),
    status: page.status,
    host,
    path,
    category,
    page_type: pageType,
    word_count: wordCount(page.text),
    link_count: page.links.length,
    depth: page.depth,
  };

  if (page.lang) fields.lang = page.lang;
  if (page.canonical) fields.canonical = page.canonical;
  if (page.author) fields.author = page.author;
  if (page.siteName) fields.site_name = page.siteName;
  if (page.contentType) fields.content_type = page.contentType.split(";")[0]?.trim();
  if (keywords.length) fields.keywords = keywords.join(" ");
  if (page.headings?.length) fields.headings = page.headings.slice(0, 20).join(" | ");
  if (page.publishedAt) fields.published_at = page.publishedAt;
  if (page.ogType) fields.og_type = page.ogType;

  return {
    id: url,
    fields: normalizeDocumentFields(fields),
    meta: {
      source: "spider",
      depth: page.depth,
      fetchedAt: page.fetchedAt,
      roles: page.roles,
      links: page.links.slice(0, 50),
      category,
      page_type: pageType,
      host,
    },
  };
}

/**
 * Enrich any index document with host/path/category/word_count when possible.
 * Safe to call even when the user already defined a schema — adds useful fields.
 */
export function enrichIndexDocument(doc: IndexDocumentPayload): IndexDocumentPayload {
  const fields: Record<string, unknown> = { ...doc.fields };
  const url =
    (typeof fields.url === "string" && fields.url) ||
    (typeof doc.id === "string" && /^https?:\/\//i.test(doc.id) ? doc.id : "") ||
    "";

  if (url) {
    if (fields.host == null) fields.host = hostFromUrl(url);
    if (fields.path == null) fields.path = pathFromUrl(url);
    if (fields.url == null) fields.url = url;
    if (fields.category == null) {
      fields.category = inferCategory(
        url,
        typeof fields.title === "string" ? fields.title : "",
        typeof fields.keywords === "string" ? fields.keywords.split(/\s+/) : [],
      );
    }
    if (fields.page_type == null) {
      fields.page_type = inferPageType({
        path: String(fields.path ?? pathFromUrl(url)),
        contentType: typeof fields.content_type === "string" ? fields.content_type : undefined,
      });
    }
  }

  const bodyText =
    (typeof fields.body === "string" && fields.body) ||
    (typeof fields.text === "string" && fields.text) ||
    (typeof fields.content === "string" && fields.content) ||
    "";
  if (bodyText && fields.word_count == null) fields.word_count = wordCount(bodyText);

  return {
    ...doc,
    fields: normalizeDocumentFields(fields),
    meta: {
      ...(doc.meta ?? {}),
      enriched: true,
      ...(fields.category != null ? { category: fields.category } : {}),
      ...(fields.host != null ? { host: fields.host } : {}),
    },
  };
}

export const INDEXER_DEFAULT_BATCH = 50;
