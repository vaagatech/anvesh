/**
 * Per-role HTTP session — cookies + headers for post-login crawling.
 */
import type { CrawlRole } from "@vaagatech/anvesh-shared";

export class RoleSession {
  readonly roleName: string;
  private cookies = new Map<string, string>();
  private readonly baseHeaders: Record<string, string>;

  constructor(
    role: CrawlRole,
    private readonly userAgent: string,
    private readonly timeoutMs: number,
  ) {
    this.roleName = role.name;
    this.baseHeaders = { ...(role.headers ?? {}) };
    if (role.cookie) this.ingestCookieHeader(role.cookie);
  }

  private ingestCookieHeader(header: string): void {
    for (const part of header.split(";")) {
      const [k, ...rest] = part.trim().split("=");
      if (!k || rest.length === 0) continue;
      this.cookies.set(k.trim(), rest.join("=").trim());
    }
  }

  private ingestSetCookie(headers: Headers): void {
    const raw = headers.getSetCookie?.() ?? [];
    const fallback = headers.get("set-cookie");
    const list = raw.length ? raw : fallback ? [fallback] : [];
    for (const line of list) {
      const first = line.split(";")[0];
      if (!first) continue;
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      this.cookies.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
    }
  }

  private cookieHeader(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = {
      "user-agent": this.userAgent,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ...this.baseHeaders,
      ...extra,
    };
    const cookie = this.cookieHeader();
    if (cookie) h.cookie = cookie;
    return h;
  }

  async login(role: CrawlRole): Promise<void> {
    if (!role.login) return;
    const { url, method, body, contentType, headers: loginHeaders, username, password } =
      role.login;

    const resolved: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      resolved[k] = String(v)
        .replaceAll("{{username}}", username ?? "")
        .replaceAll("{{password}}", password ?? "");
    }

    let payload: string;
    const hdrs = this.headers(loginHeaders);
    if (contentType === "application/json") {
      hdrs["content-type"] = "application/json";
      payload = JSON.stringify(resolved);
    } else {
      hdrs["content-type"] = "application/x-www-form-urlencoded";
      payload = new URLSearchParams(resolved).toString();
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: hdrs,
        body: method === "GET" ? undefined : payload,
        redirect: "manual",
        signal: controller.signal,
      });
      this.ingestSetCookie(res.headers);
      // Follow one redirect manually to capture session cookies
      const loc = res.headers.get("location");
      if (loc && res.status >= 300 && res.status < 400) {
        const next = new URL(loc, url).toString();
        const res2 = await fetch(next, {
          method: "GET",
          headers: this.headers(),
          redirect: "manual",
          signal: controller.signal,
        });
        this.ingestSetCookie(res2.headers);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async fetch(url: string): Promise<{
    status: number;
    finalUrl: string;
    headers: Headers;
    body: string;
  }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: this.headers(),
        redirect: "follow",
        signal: controller.signal,
      });
      this.ingestSetCookie(res.headers);
      const body = await res.text();
      return {
        status: res.status,
        finalUrl: res.url || url,
        headers: res.headers,
        body,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
