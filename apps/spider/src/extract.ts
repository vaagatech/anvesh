/**
 * HTML → title, text, links, and structured metadata (heuristic, not ML).
 */
import { parseHTML } from "linkedom";

export interface ExtractedPage {
  title: string;
  text: string;
  description?: string;
  links: string[];
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
}

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "SVG",
  "IFRAME",
  "TEMPLATE",
]);

function metaContent(
  document: { querySelector: (s: string) => { getAttribute: (n: string) => string | null } | null },
  selectors: string[],
): string | undefined {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const content = el?.getAttribute("content")?.trim();
    if (content) return content;
  }
  return undefined;
}

function splitKeywords(raw: string | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const parts = raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts.slice(0, 40) : undefined;
}

export function extractPage(html: string, baseUrl: string): ExtractedPage {
  const { document } = parseHTML(html);

  const lang =
    document.documentElement?.getAttribute("lang")?.trim() ||
    metaContent(document, ['meta[http-equiv="content-language"]']) ||
    undefined;

  const ogTitle = metaContent(document, ['meta[property="og:title"]']);
  const ogDescription = metaContent(document, ['meta[property="og:description"]']);
  const ogType = metaContent(document, ['meta[property="og:type"]']);
  const siteName = metaContent(document, [
    'meta[property="og:site_name"]',
    'meta[name="application-name"]',
  ]);

  const title =
    document.querySelector("title")?.textContent?.trim() ||
    ogTitle ||
    document.querySelector("h1")?.textContent?.trim() ||
    "";

  const description =
    metaContent(document, [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]) || undefined;

  const author = metaContent(document, [
    'meta[name="author"]',
    'meta[property="article:author"]',
  ]);

  const keywords = splitKeywords(
    metaContent(document, ['meta[name="keywords"]', 'meta[property="article:tag"]']),
  );

  const publishedAt = metaContent(document, [
    'meta[property="article:published_time"]',
    'meta[name="date"]',
    'meta[name="publishdate"]',
    'meta[itemprop="datePublished"]',
  ]);

  let canonical: string | undefined;
  const canonHref = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  if (canonHref) {
    try {
      canonical = new URL(canonHref, baseUrl).toString();
    } catch {
      canonical = canonHref;
    }
  }

  const headings: string[] = [];
  for (const h of Array.from(document.querySelectorAll("h1, h2, h3"))) {
    const t = h.textContent?.replace(/\s+/g, " ").trim();
    if (t && headings.length < 30) headings.push(t);
  }

  const hasArticle = Boolean(
    document.querySelector("article") ||
      ogType?.toLowerCase().includes("article") ||
      publishedAt,
  );

  for (const el of Array.from(
    document.querySelectorAll("script,style,noscript,svg,iframe,template"),
  )) {
    el.remove();
  }

  const body = document.body ?? document.documentElement;
  
  function getText(node: any): string {
    if (node.nodeType === 3) return node.nodeValue || "";
    if (node.nodeType !== 1) return "";
    const tag = (node.tagName || "").toUpperCase();
    const isBlock = /^(DIV|P|H1|H2|H3|H4|H5|H6|LI|TR|TD|TH|BR|SECTION|ARTICLE|ASIDE|NAV|HEADER|FOOTER|UL|OL|DL|DD|DT)$/.test(tag);
    let res = isBlock ? " " : "";
    for (const child of node.childNodes) {
      res += getText(child);
    }
    return res + (isBlock ? " " : "");
  }

  const text = getText(body)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200_000);

  const links: string[] = [];
  const seen = new Set<string>();
  for (const a of Array.from(document.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href");
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("javascript:")
    ) {
      continue;
    }
    try {
      const abs = new URL(href, baseUrl);
      abs.hash = "";
      const s = abs.toString();
      if (!seen.has(s)) {
        seen.add(s);
        links.push(s);
      }
    } catch {
      /* ignore bad URLs */
    }
  }

  void SKIP_TAGS;
  return {
    title,
    text,
    description,
    links,
    lang,
    canonical,
    author,
    keywords,
    headings: headings.length ? headings : undefined,
    siteName,
    ogTitle,
    ogDescription,
    ogType,
    publishedAt,
    hasArticle,
  };
}
