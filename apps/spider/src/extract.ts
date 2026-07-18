/**
 * HTML → title, text, links (linkedom — lightweight DOM in Node).
 */
import { parseHTML } from "linkedom";

export interface ExtractedPage {
  title: string;
  text: string;
  description?: string;
  links: string[];
}

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "SVG",
  "IFRAME",
  "TEMPLATE",
]);

export function extractPage(html: string, baseUrl: string): ExtractedPage {
  const { document } = parseHTML(html);
  const title =
    document.querySelector("title")?.textContent?.trim() ||
    document.querySelector("h1")?.textContent?.trim() ||
    "";

  const description =
    document
      .querySelector('meta[name="description"]')
      ?.getAttribute("content")
      ?.trim() || undefined;

  for (const el of Array.from(document.querySelectorAll("script,style,noscript,svg,iframe,template"))) {
    el.remove();
  }

  const body = document.body ?? document.documentElement;
  const text = (body?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200_000);

  const links: string[] = [];
  const seen = new Set<string>();
  for (const a of Array.from(document.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
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
  return { title, text, description, links };
}
