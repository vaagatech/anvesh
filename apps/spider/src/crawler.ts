/**
 * Full-site spider with role-based sessions (guest / user / admin / …).
 * Discovers pages visible only after login for each configured role.
 */
import type { CrawledPage, CrawlRole, SpiderConfig } from "@vaagatech/anvesh-shared";
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

export class SiteSpider {
  constructor(
    private readonly config: SpiderConfig,
    private readonly log: Logger,
  ) {}

  async crawl(): Promise<CrawledPage[]> {
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
        robotsByOrigin.set(host, await RobotsRules.fetch(o, this.config.userAgent, this.config.requestTimeoutMs));
      }
    }

    const seedExtras: string[] = [];
    if (this.config.followSitemaps) {
      for (const [, robots] of robotsByOrigin) {
        for (const sm of robots.getSitemaps()) {
          const urls = await parseSitemapUrls(
            sm,
            this.config.userAgent,
            this.config.requestTimeoutMs,
          );
          seedExtras.push(...urls);
          this.log.info({ sitemap: sm, urls: urls.length }, "Loaded sitemap URLs.");
        }
        // common default
      }
      for (const seed of seeds) {
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
      }
    }

    /** url → page aggregate across roles */
    const byUrl = new Map<string, CrawledPage>();

    for (const role of this.config.roles) {
      this.log.info({ role: role.name }, `Starting crawl pass for role "${role.name}".`);
      const pages = await this.crawlAsRole(
        role,
        [...seeds, ...seedExtras],
        allowedHosts,
        robotsByOrigin,
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
    }

    return [...byUrl.values()];
  }

  private async crawlAsRole(
    role: CrawlRole,
    seeds: string[],
    allowedHosts: Set<string>,
    robotsByOrigin: Map<string, RobotsRules>,
  ): Promise<CrawledPage[]> {
    const session = new RoleSession(role, this.config.userAgent, this.config.requestTimeoutMs);
    if (!role.anonymous && role.login) {
      this.log.info({ role: role.name, loginUrl: role.login.url }, "Performing role login.");
      await session.login(role);
    }

    const queue: QueueItem[] = [];
    const seen = new Set<string>();
    const results: CrawledPage[] = [];

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

    await new Promise<void>((resolve) => {
      const pump = () => {
        if (results.length >= this.config.maxPages && queue.length === 0 && active === 0) {
          resolve();
          return;
        }
        if (queue.length === 0 && active === 0) {
          resolve();
          return;
        }
        while (active < workers && queue.length > 0 && results.length < this.config.maxPages) {
          const item = queue.shift()!;
          active += 1;
          void this.fetchOne(session, role, item)
            .then((page) => {
              if (page) {
                results.push(page);
                if (page.status >= 200 && page.status < 400) {
                  for (const link of page.links) {
                    enqueue(link, item.depth + 1);
                  }
                }
              }
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
      };
    } catch (err) {
      this.log.warn(
        { url: item.url, role: role.name, err: err instanceof Error ? err.message : String(err) },
        "Fetch failed for URL.",
      );
      return null;
    }
  }
}
