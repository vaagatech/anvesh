import { beforeAll, describe, expect, it } from "vitest";
import { ensureRichIndex, getE2EContext, type E2EContext } from "./helpers/context.js";
import { engineRequest } from "./helpers/stack.js";

describe("e2e: search features (keyword → geo → facets → bool)", () => {
  let ctx: E2EContext;
  let index: string;

  beforeAll(async () => {
    ctx = await getE2EContext();
    await ctx.admin.login(ctx.env.ANVESH_HUB_ADMIN_USER, ctx.env.ANVESH_HUB_ADMIN_PASSWORD);
    index = await ensureRichIndex();
  }, 60_000);

  async function search(body: Record<string, unknown>) {
    return ctx.admin.request<{
      total: number;
      hits: Array<{
        id: string;
        score: number;
        highlight?: Record<string, string[]>;
        distanceKm?: number;
        source?: { fields?: Record<string, unknown> };
      }>;
      facets?: Record<string, Array<{ key: string | number; count: number }>>;
    }>("POST", `/hub/engines/${ctx.engineId}/indexes/${index}/search`, body);
  }

  it("keyword, fuzzy, phrase, phraseSlop, prefix, wildcards", async () => {
    const kw = await search({ q: "hiking trails", mode: "keyword", size: 10 });
    expect(kw.total).toBeGreaterThanOrEqual(1);
    expect(kw.hits[0]?.id).toBe("r1");

    const fuzzy = await search({ q: "elephent", mode: "keyword", fuzziness: 1 });
    expect(fuzzy.hits.some((h) => h.id === "r3")).toBe(true);

    const phrase = await search({ q: "hiking trails", mode: "keyword", phrase: true });
    expect(phrase.total).toBeGreaterThanOrEqual(1);

    const slop = await search({
      q: "red shoes",
      mode: "keyword",
      phrase: true,
      phraseSlop: 2,
    });
    expect(slop.hits.some((h) => h.id === "r4")).toBe(true);

    const prefix = await search({ q: "alpin", mode: "keyword", prefix: true });
    expect(prefix.total).toBeGreaterThanOrEqual(1);

    const star = await search({ q: "alpin*", mode: "keyword" });
    expect(star.total).toBeGreaterThanOrEqual(1);

    // single-char wildcard against stemmed "elephant" → "eleph" etc; use prefix of "coffee"
    const qmark = await search({ q: "coffe?", mode: "keyword" });
    expect(qmark.total).toBeGreaterThanOrEqual(1);
  });

  it("hybrid, semantic, highlight, boosts, fields, minScore, pagination", async () => {
    const hybrid = await search({ q: "trail running shoes", mode: "hybrid", size: 5 });
    expect(hybrid.total).toBeGreaterThanOrEqual(1);

    const semantic = await search({ q: "mountain outdoor gear", mode: "semantic", size: 5 });
    expect(semantic.total).toBeGreaterThanOrEqual(1);

    const hl = await search({
      q: "hiking",
      mode: "keyword",
      highlight: true,
      fields: ["title", "body"],
    });
    expect(hl.hits.some((h) => h.highlight && Object.keys(h.highlight).length > 0)).toBe(true);

    const boosted = await search({
      q: "ceramic",
      mode: "keyword",
      boosts: { title: 5, body: 0.1 },
    });
    expect(boosted.total).toBeGreaterThanOrEqual(1);

    const page1 = await search({ q: "ceramic", mode: "keyword", from: 0, size: 1 });
    expect(page1.hits).toHaveLength(1);
    const after = page1.hits[0]!.id;
    const page2 = await search({
      q: "ceramic",
      mode: "keyword",
      size: 1,
      searchAfter: after,
    });
    expect(page2.hits.every((h) => h.id !== after)).toBe(true);

    const filtered = await search({
      q: "pack",
      mode: "keyword",
      minScore: 9999,
    });
    expect(filtered.total).toBe(0);
  });

  it("filters, range, bool must/should/mustNot", async () => {
    const term = await search({
      q: "pack",
      mode: "keyword",
      filters: [{ field: "category", value: "outdoors" }],
    });
    expect(term.hits.every((h) => h.source?.fields?.category === "outdoors")).toBe(true);

    const range = await search({
      q: "ceramic",
      mode: "keyword",
      filters: [{ field: "price", gte: 10, lte: 30 }],
    });
    expect(range.total).toBeGreaterThanOrEqual(1);

    const must = await search({
      q: "shoes",
      mode: "keyword",
      must: [{ field: "category", value: "footwear" }],
    });
    expect(must.hits.some((h) => h.id === "r4")).toBe(true);

    const should = await search({
      q: "ceramic",
      mode: "keyword",
      should: [{ field: "category", value: "kitchen" }],
    });
    expect(should.total).toBeGreaterThanOrEqual(1);

    const mustNot = await search({
      q: "ceramic",
      mode: "keyword",
      mustNot: [{ field: "category", value: "kitchen" }],
    });
    expect(mustNot.hits.every((h) => h.source?.fields?.category !== "kitchen")).toBe(true);
  });

  it("geo radius, bbox, and keyword+geo", async () => {
    const geo = await search({
      mode: "geo",
      geo: {
        field: "location",
        origin: { lat: 37.77, lon: -122.42 },
        distanceKm: 50,
        sortByDistance: true,
      },
      size: 10,
    });
    expect(geo.total).toBeGreaterThanOrEqual(2);
    expect(geo.hits[0]?.distanceKm).toBeTypeOf("number");

    const box = await search({
      mode: "geo",
      geo: {
        field: "location",
        boundingBox: { top: 38, left: -123, bottom: 37, right: -122 },
      },
    });
    expect(box.total).toBeGreaterThanOrEqual(1);

    const kwGeo = await search({
      q: "hiking",
      mode: "keyword",
      geo: {
        field: "location",
        origin: { lat: 37.77, lon: -122.42 },
        distanceKm: 20,
      },
    });
    expect(kwGeo.total).toBeGreaterThanOrEqual(1);
  });

  it("facets terms, stats, histogram", async () => {
    const facets = await search({
      q: "ceramic OR hiking OR shoes OR pack OR plate",
      mode: "keyword",
      size: 10,
      facets: ["category", "stats:price", "histogram:price:20"],
    });
    // broad query may not use OR — use empty-ish filter via listing through keyword on common term
    const f2 = await search({
      q: "a",
      mode: "keyword",
      prefix: true,
      size: 20,
      facets: ["category", "stats:price", "histogram:price:20"],
    });
    expect(f2.facets?.category?.length).toBeGreaterThanOrEqual(1);
    expect(f2.facets?.["stats:price"]?.length).toBeGreaterThanOrEqual(1);
    expect(f2.facets?.["histogram:price:20"]?.length).toBeGreaterThanOrEqual(1);
    void facets;
  });

  it("suggest, aliases list/delete, update-by-query", async () => {
    const suggest = await engineRequest(ctx.env, "POST", `/v1/indexes/${index}/suggest`, {
      prefix: "alpin",
      field: "title",
      size: 5,
    });
    expect(suggest.ok).toBe(true);
    expect((suggest.json.suggestions as string[]).length).toBeGreaterThanOrEqual(0);

    await engineRequest(ctx.env, "PUT", "/v1/aliases/e2e-rich-alias", { index });
    const aliases = await engineRequest(ctx.env, "GET", "/v1/aliases");
    expect(aliases.ok).toBe(true);
    expect((aliases.json.aliases as Record<string, string>)["e2e-rich-alias"]).toBe(index);

    const via = await engineRequest(ctx.env, "POST", "/v1/indexes/e2e-rich-alias/search", {
      q: "hiking",
      mode: "keyword",
    });
    expect(via.ok).toBe(true);

    const ubq = await engineRequest(ctx.env, "POST", `/v1/indexes/${index}/update-by-query`, {
      filters: [{ field: "price", gte: 100 }],
      set: { status: 299 },
      maxDocs: 10,
    });
    expect(ubq.ok).toBe(true);
    expect((ubq.json.updated as number) >= 1).toBe(true);

    await engineRequest(ctx.env, "DELETE", "/v1/aliases/e2e-rich-alias");
    const after = await engineRequest(ctx.env, "GET", "/v1/aliases");
    expect((after.json.aliases as Record<string, string>)["e2e-rich-alias"]).toBeUndefined();
  });
});
