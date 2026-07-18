/**
 * Minimal robots.txt parser — allow/disallow for our user-agent.
 */
export class RobotsRules {
  private disallows: string[] = [];
  private allows: string[] = [];
  private sitemaps: string[] = [];

  static async fetch(origin: string, userAgent: string, timeoutMs: number): Promise<RobotsRules> {
    const rules = new RobotsRules();
    const url = `${origin.replace(/\/$/, "")}/robots.txt`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        headers: { "user-agent": userAgent },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return rules;
      rules.parse(await res.text(), userAgent);
    } catch {
      /* treat as allow-all if robots unreachable */
    }
    return rules;
  }

  parse(text: string, userAgent: string): void {
    const lines = text.split(/\r?\n/);
    let active = false;
    let bestSpecific = false;

    for (const raw of lines) {
      const line = raw.replace(/#.*$/, "").trim();
      if (!line) continue;
      const [keyRaw, ...rest] = line.split(":");
      const key = keyRaw?.trim().toLowerCase();
      const value = rest.join(":").trim();
      if (!key) continue;

      if (key === "user-agent") {
        const ua = value.toLowerCase();
        const matches =
          ua === "*" || userAgent.toLowerCase().includes(ua.replace(/\*/g, ""));
        if (ua !== "*" && matches) {
          active = true;
          bestSpecific = true;
          this.disallows = [];
          this.allows = [];
        } else if (ua === "*" && !bestSpecific) {
          active = true;
        } else {
          active = false;
        }
        continue;
      }

      if (!active) continue;
      if (key === "disallow") {
        if (value) this.disallows.push(value);
      } else if (key === "allow") {
        if (value) this.allows.push(value);
      } else if (key === "sitemap") {
        this.sitemaps.push(value);
      }
    }
  }

  isAllowed(pathname: string): boolean {
    let allowed = true;
    let bestLen = -1;
    for (const rule of this.disallows) {
      if (pathname.startsWith(rule) && rule.length > bestLen) {
        allowed = false;
        bestLen = rule.length;
      }
    }
    for (const rule of this.allows) {
      if (pathname.startsWith(rule) && rule.length > bestLen) {
        allowed = true;
        bestLen = rule.length;
      }
    }
    return allowed;
  }

  getSitemaps(): string[] {
    return [...this.sitemaps];
  }
}

export async function parseSitemapUrls(
  sitemapUrl: string,
  userAgent: string,
  timeoutMs: number,
  limit = 2000,
): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(sitemapUrl, {
      headers: { "user-agent": userAgent },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const urls: string[] = [];
    const locRe = /<loc>\s*([^<]+)\s*<\/loc>/gi;
    let m: RegExpExecArray | null;
    while ((m = locRe.exec(xml)) !== null && urls.length < limit) {
      const u = m[1]?.trim();
      if (u) urls.push(u);
    }
    return urls;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
