/**
 * Shared contracts between spider → indexer → engine.
 * VaagaTech · https://www.vaagatech.com
 */
import { z } from "zod";

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
  maxPages: z.number().int().positive().default(500),
  maxDepth: z.number().int().min(0).default(8),
  concurrency: z.number().int().positive().default(4),
  delayMs: z.number().int().min(0).default(200),
  respectRobotsTxt: z.boolean().default(true),
  followSitemaps: z.boolean().default(true),
  userAgent: z.string().default("AnveshSpider/0.1 (+https://www.vaagatech.com)"),
  requestTimeoutMs: z.number().int().positive().default(20000),
  roles: z
    .array(crawlRoleSchema)
    .min(1)
    .default([{ name: "guest", anonymous: true }]),
  indexName: z.string().default("web"),
  outputPath: z.string().optional(),
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
}

export interface IndexDocumentPayload {
  id?: string;
  fields: Record<string, unknown>;
  vector?: number[];
  meta?: Record<string, unknown>;
}

/** Map a crawled page into an engine document. */
export function crawledPageToDocument(page: CrawledPage): IndexDocumentPayload {
  return {
    id: page.finalUrl,
    fields: {
      title: page.title,
      body: page.text,
      url: page.finalUrl,
      description: page.description ?? "",
      roles: page.roles.join(" "),
      status: page.status,
    },
    meta: {
      source: "spider",
      depth: page.depth,
      fetchedAt: page.fetchedAt,
      roles: page.roles,
      links: page.links.slice(0, 50),
    },
  };
}

export const INDEXER_DEFAULT_BATCH = 50;
