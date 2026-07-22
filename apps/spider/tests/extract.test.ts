import { describe, it, expect } from "vitest";
import { extractPage } from "../src/extract.js";

describe("extractPage", () => {
  it("extracts title, text, and absolute links", () => {
    const html = `
      <html><head>
        <title>Hello</title>
        <meta name="description" content="A page" />
      </head>
      <body>
        <script>evil()</script>
        <h1>Welcome</h1>
        <p>Body text</p>
        <a href="/about">About</a>
        <a href="https://other.com/x">External</a>
      </body></html>`;
    const page = extractPage(html, "https://example.com/");
    expect(page.title).toBe("Hello");
    expect(page.description).toBe("A page");
    expect(page.text).toContain("Body text");
    expect(page.text).not.toContain("evil");
    expect(page.links).toContain("https://example.com/about");
    expect(page.links).toContain("https://other.com/x");
  });

  it("extracts og, lang, canonical, keywords, and headings", () => {
    const html = `
      <html lang="en">
      <head>
        <title>Docs Home</title>
        <link rel="canonical" href="https://example.com/docs/" />
        <meta name="keywords" content="search, engine, api" />
        <meta name="author" content="VaagaTech" />
        <meta property="og:title" content="OG Docs" />
        <meta property="og:type" content="article" />
        <meta property="og:site_name" content="Example" />
        <meta property="article:published_time" content="2026-01-15T10:00:00Z" />
      </head>
      <body>
        <article>
          <h1>Getting started</h1>
          <h2>Install</h2>
          <p>Install the package.</p>
        </article>
      </body></html>`;
    const page = extractPage(html, "https://example.com/docs/");
    expect(page.lang).toBe("en");
    expect(page.canonical).toBe("https://example.com/docs/");
    expect(page.keywords).toEqual(["search", "engine", "api"]);
    expect(page.author).toBe("VaagaTech");
    expect(page.ogType).toBe("article");
    expect(page.siteName).toBe("Example");
    expect(page.publishedAt).toBe("2026-01-15T10:00:00Z");
    expect(page.hasArticle).toBe(true);
    expect(page.headings?.[0]).toBe("Getting started");
  });
});
