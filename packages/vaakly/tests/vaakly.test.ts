import { describe, it, expect } from "vitest";
import { createPluginRegistry } from "@vaagatech/anvesh-plugins";
import { correctSummary, createVaaklyPlugin, formatMessage } from "../src/index.js";

describe("correctSummary", () => {
  it("pluralizes search hits", () => {
    expect(
      correctSummary({
        message: "Search completed. Found 1 matching document in 12ms.",
        code: "OK_SEARCH",
        total: 1,
        tookMs: 12,
      }),
    ).toBe("Search completed. Found 1 matching document in 12ms.");

    expect(
      correctSummary({
        message: "unused",
        code: "OK_SEARCH",
        total: 3,
        tookMs: 12,
      }),
    ).toBe("Search completed. Found 3 matching documents in 12ms.");

    expect(
      correctSummary({ message: "unused", code: "OK_SEARCH", total: 0, tookMs: 5 }),
    ).toBe("Search completed. No matching documents found in 5ms.");
  });

  it("fixes legacy document(s) phrasing", () => {
    expect(correctSummary({ message: "Found 2 matching document(s) in 9ms." })).toContain(
      "2 matching documents",
    );
  });
});

describe("formatMessage", () => {
  it("returns corrected plurals for OK_SEARCH", () => {
    const m = formatMessage("OK_SEARCH", { total: 3, tookMs: 12, mode: "keyword" });
    expect(m.message).toBe("Search completed. Found 3 matching documents in 12ms.");
    expect(m.logLine).toContain("total=3");
  });
});

describe("vaakly plugin", () => {
  it("registers tools and corrects via invoke", async () => {
    const reg = createPluginRegistry({ host: "test" });
    reg.register(createVaaklyPlugin());
    expect(reg.listTools().map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "vaakly.format_message",
        "vaakly.correct_summary",
        "vaakly.list_codes",
      ]),
    );
    const res = await reg.invoke("vaakly.correct_summary", {
      message: "Found 1 matching document(s).",
      code: "OK_SEARCH",
      total: 1,
    });
    expect(res.ok).toBe(true);
    expect((res.result as { message: string }).message).toContain("1 matching document");
  });
});
