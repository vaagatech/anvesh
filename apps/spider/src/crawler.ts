import {
  type CrawledPage,
  type CrawlRole,
  type SpiderConfig,
  globalDeadLetter,
  globalResourceGuard,
} from "@vaagatech/anvesh-shared";
import v8 from "node:v8";
import { RoleSession } from "./session.js";
import { parseSitemapUrls, RobotsRules } from "./robots.js";
import { extractPage } from "./extract.js";
import type { Logger } from "pino";

interface QueueItem {
  url: string;
  depth: number;
}

function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    // Drop common tracking params lightly
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((p) =>
      u.searchParams.delete(p),
    );
    return u.toString();
  } catch {
    return null;
  }
}

function hostAllowed(url: string, allowedHosts: Set<string>): boolean {
  try {
    return allowedHosts.has(new URL(url).host);
  } catch {
    return false;
  }
}

function pathAllowed(url: string, cfg: SpiderConfig): boolean {
  const { pathname } = new URL(url);
    if (cfg.allowPathPrefixes?.length) {
      if (!cfg.allowPathPrefixes.some((p: string) => pathname.startsWith(p))) return false;
    }
    if (cfg.denyPathPatterns?.length) {
      for (const pat of cfg.denyPathPatterns) {
      try {
        if (pat.startsWith("/") && !pat.includes("*")) {
          if (pathname.startsWith(pat)) return false;
        } else if (new RegExp(pat).test(pathname)) {
          return false;
        }
      } catch {
        if (pathname.includes(pat)) return false;
      }
    }
  }
  return true;
}

const DEFAULT_CHUNK_SIZE = Number(process.env.ANVESH_SPIDER_CHUNK_SIZE ?? 50);
const DEFAULT_HEAP_WATCH_PERCENT = Number(process.env.ANVESH_SPIDER_HEAP_WATCH_PERCENT ?? 25);

export class SiteSpider {
  constructor(
    private readonly config: SpiderConfig,
    private readonly log: Logger,
  ) {}

  async crawl(
    onChunk?: (chunk: CrawledPage[]) => Promise<void>,
    chunkSize = DEFAULT_CHUNK_SIZE,
  ): Promise<CrawledPage[]> {
    const seeds = this.config.seeds
      .map((s) => normalizeUrl(s))
      .filter((s): s is string => Boolean(s));
    const allowedHosts = new Set<string>(
      this.config.allowedHosts?.length
        ? this.config.allowedHosts
        : seeds.map((s) => new URL(s).host),
    );

    const robotsByOrigin = new Map<string, RobotsRules>();
    if (this.config.respectRobotsTxt) {
      for (const host of allowedHosts) {
        const origin = `https://${host}`;
        // try https then http based on seeds
        const seed = seeds.find((s) => new URL(s).host === host);
        const o = seed ? new URL(seed).origin : origin;
        try {
          robotsByOrigin.set(
            host,
            await RobotsRules.fetch(o, this.config.userAgent, this.config.requestTimeoutMs),
          );
        } catch (e) {
          this.log.warn(
            { host, err: e instanceof Error ? e.message : String(e) },
            "Failed to fetch robots.txt — continuing without rules.",
          );
        }
      }
    }

    const seedExtras: string[] = [];
    if (this.config.followSitemaps) {
      for (const [, robots] of robotsByOrigin) {
        for (const sm of robots.getSitemaps()) {
          try {
            const urls = await parseSitemapUrls(
              sm,
              this.config.userAgent,
              this.config.requestTimeoutMs,
            );
            seedExtras.push(...urls);
            this.log.info({ sitemap: sm, urls: urls.length }, "Loaded sitemap URLs.");
          } catch (e) {
            this.log.warn(
              { sitemap: sm, err: e instanceof Error ? e.message : String(e) },
              "Failed to fetch sitemap — continuing.",
            );
          }
        }
      }
      for (const seed of seeds) {
        try {
          const sm = `${new URL(seed).origin}/sitemap.xml`;
          const urls = await parseSitemapUrls(
            sm,
            this.config.userAgent,
            this.config.requestTimeoutMs,
          );
          if (urls.length) {
            seedExtras.push(...urls);
            this.log.info({ sitemap: sm, urls: urls.length }, "Loaded default sitemap.");
          }
        } catch (e) {
          this.log.debug(
            { seed, err: e instanceof Error ? e.message : String(e) },
            "No default sitemap found.",
          );
        }
      }
    }

    /** url → page aggregate across roles */
    const byUrl = new Map<string, CrawledPage>();

    for (const role of this.config.roles) {
      this.log.info({ role: role.name }, `Starting crawl pass for role "${role.name}".`);
      try {
        const pages = await this.crawlAsRole(
          role,
          [...seeds, ...seedExtras],
          allowedHosts,
          robotsByOrigin,
          onChunk,
          chunkSize,
        );
        for (const page of pages) {
          const key = page.finalUrl;
          const existing = byUrl.get(key);
          if (existing) {
            if (!existing.roles.includes(role.name)) existing.roles.push(role.name);
            // Prefer richer text if we got more content under this role
            if (page.text.length > existing.text.length) {
              existing.text = page.text;
              existing.title = page.title || existing.title;
              existing.description = page.description ?? existing.description;
            }
          } else {
            byUrl.set(key, page);
          }
        }
        this.log.info(
          { role: role.name, pages: pages.length },
          `Finished crawl pass for role "${role.name}" — discovered ${pages.length} page(s).`,
        );
      } catch (err) {
        this.log.warn(
          { role: role.name, err: err instanceof Error ? err.message : String(err) },
          `Crawl pass for role "${role.name}" encountered an error — continuing.`,
        );
      }
    }

    return [...byUrl.values()];
  }

  private async crawlAsRole(
    role: CrawlRole,
    seeds: string[],
    allowedHosts: Set<string>,
    robotsByOrigin: Map<string, RobotsRules>,
    onChunk?: (chunk: CrawledPage[]) => Promise<void>,
    chunkSize = 50,
  ): Promise<CrawledPage[]> {
    const session = new RoleSession(role, this.config.userAgent, this.config.requestTimeoutMs);
    if (!role.anonymous && role.login) {
      this.log.info({ role: role.name, loginUrl: role.login.url }, "Performing role login.");
      try {
        await session.login(role);
      } catch (e) {
        this.log.warn(
          { role: role.name, err: e instanceof Error ? e.message : String(e) },
          "Role login failed — continuing crawl unauthenticated.",
        );
      }
    }

    const queue: QueueItem[] = [];
    const seen = new Set<string>();
    const results: CrawledPage[] = [];
    const pendingChunk: CrawledPage[] = [];

    const flushChunk = async (force = false) => {
      const resGuard = globalResourceGuard.check();
      const avgPageBytes = pendingChunk.length ? Math.round(pendingChunk.reduce((a, b) => a + (b.text?.length || 0), 0) / pendingChunk.length) : 5000;
      const targetChunkSize = globalResourceGuard.calculateAdaptiveChunkSize(pendingChunk.length, avgPageBytes, chunkSize);

      if (onChunk && (pendingChunk.length >= targetChunkSize || (pendingChunk.length > 0 && (force || !resGuard.ok || resGuard.status === "warning")))) {
        await globalResourceGuard.throttleIfNeeded("spider.flushChunk");
        const batch = pendingChunk.splice(0, pendingChunk.length);
        this.log.info(
          { count: batch.length, heapRatio: resGuard.heapRatio, status: resGuard.status },
          `Flushing chunk of ${batch.length} page(s) to pipeline (heap ratio: ${resGuard.heapRatio}).`,
        );
        await onChunk(batch);
      }
    };

    const enqueue = (raw: string, depth: number) => {
      const url = normalizeUrl(raw);
      if (!url || seen.has(url)) return;
      if (!hostAllowed(url, allowedHosts)) return;
      if (!pathAllowed(url, this.config)) return;
      if (depth > this.config.maxDepth) return;
      const host = new URL(url).host;
      const robots = robotsByOrigin.get(host);
      if (robots && !robots.isAllowed(new URL(url).pathname)) return;
      seen.add(url);
      queue.push({ url, depth });
    };

    for (const s of seeds) enqueue(s, 0);

    const workers = Math.max(1, this.config.concurrency);
    let active = 0;

    const limit = this.config.maxPages > 0 ? this.config.maxPages : Infinity;

    await new Promise<void>((resolve) => {
      const pump = () => {
        if (active === 0 && (results.length >= limit || queue.length === 0)) {
          resolve();
          return;
        }
        while (active < workers && queue.length > 0 && results.length < limit) {
          const item = queue.shift()!;
          active += 1;
          void this.fetchOne(session, role, item)
            .then(async (page) => {
              if (page) {
                if (!onChunk) results.push(page);
                pendingChunk.push(page);
                if (page.status >= 200 && page.status < 400) {
                  for (const link of page.links) {
                    enqueue(link, item.depth + 1);
                  }
                }
                await flushChunk();
              }
            })
            .catch((err) => {
              this.log.warn(
                { url: item.url, role: role.name, err: err instanceof Error ? err.stack || err.message : String(err) },
                "Uncaught fetchOne error — continuing queue processing.",
              );
            })
            .finally(async () => {
              active -= 1;
              if (this.config.delayMs > 0) {
                await new Promise((r) => setTimeout(r, this.config.delayMs));
              }
              pump();
            });
        }
      };
      pump();
    });

    await flushChunk(true);

    return results;
  }

  private async fetchOne(
    session: RoleSession,
    role: CrawlRole,
    item: QueueItem,
  ): Promise<CrawledPage | null> {
    try {
      const res = await session.fetch(item.url);
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("html") && !ct.includes("xml") && res.body.trimStart().startsWith("<")) {
        // still try HTML parse
      } else if (ct && !ct.includes("html") && !ct.includes("text/") && !ct.includes("xml")) {
        this.log.debug({ url: item.url, ct }, "Skipping non-HTML resource.");
        return null;
      }

      // Role-gated: 401/403 means this role cannot see the page
      if (res.status === 401 || res.status === 403) {
        this.log.debug(
          { url: item.url, role: role.name, status: res.status },
          "Page forbidden for this role — not indexed under this role.",
        );
        return null;
      }

      const extracted = extractPage(res.body, res.finalUrl);
      return {
        url: item.url,
        finalUrl: normalizeUrl(res.finalUrl) ?? res.finalUrl,
        status: res.status,
        title: extracted.title,
        text: extracted.text,
        description: extracted.description,
        links: extracted.links,
        roles: [role.name],
        depth: item.depth,
        fetchedAt: new Date().toISOString(),
        contentType: ct || undefined,
        lang: extracted.lang,
        canonical: extracted.canonical,
        author: extracted.author,
        keywords: extracted.keywords,
        headings: extracted.headings,
        siteName: extracted.siteName,
        ogTitle: extracted.ogTitle,
        ogDescription: extracted.ogDescription,
        ogType: extracted.ogType,
        publishedAt: extracted.publishedAt,
        hasArticle: extracted.hasArticle,
      };
    } catch (err) {
      const cause = err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined;
      const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : null;
      const errMsg = err instanceof Error ? err.message : String(err);
      const errDetail = causeMsg ? `${errMsg} (${causeMsg})` : errMsg;
      this.log.warn(
        { url: item.url, role: role.name, err: errDetail },
        "Fetch failed for URL — isolated to dead-letter queue.",
      );
      globalDeadLetter.record({
        recordId: item.url,
        source: "spider",
        error: err instanceof Error ? err : errDetail,
        payload: { url: item.url, depth: item.depth, role: role.name },
      });
      return null;
    }
  }
}
