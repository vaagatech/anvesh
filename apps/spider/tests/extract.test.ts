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
});
