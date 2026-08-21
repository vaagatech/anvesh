import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnveshClient } from "../src/client.js";

describe("Anvesh SDK", () => {
  const baseUrl = "https://anvesh.test";
  let client: AnveshClient;

  beforeEach(() => {
    client = new AnveshClient({
      baseUrl,
      apiKey: "test-api-key",
    });
    vi.restoreAllMocks();
  });

  it("sets authorization header with api key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, status: "ok", uptimeMs: 1234 }),
    } as any);

    const res = await client.health();
    expect(res.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://anvesh.test/health",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
        }),
      })
    );
  });

  it("creates and lists indexes", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          index: { name: "products", mappings: {}, docCount: 0 },
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          indexes: [{ name: "products", mappings: {}, docCount: 0 }],
        }),
      } as any);

    const created = await client.indexes.create({
      name: "products",
      mappings: { title: { type: "text" } },
      settings: { vectorDimensions: 256, autoEmbed: true },
    });
    expect(created.name).toBe("products");

    const list = await client.indexes.list();
    expect(list.length).toBe(1);
    expect(list[0]!.name).toBe("products");
  });

  it("executes search query with hybrid options", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        total: 1,
        tookMs: 12,
        hits: [
          {
            id: "p1",
            score: 0.95,
            source: { id: "p1", fields: { title: "Silk Saree" } },
          },
        ],
      }),
    } as any);

    const res = await client.search("products", {
      q: "saree",
      mode: "hybrid",
      highlight: true,
    });

    expect(res.total).toBe(1);
    expect(res.hits[0]!.id).toBe("p1");
  });

  it("supports declarative config apply and plan", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          plan: { actions: [{ type: "create_index", target: "articles" }], hasChanges: true },
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          applied: [{ type: "create_index", target: "articles" }],
          errors: [],
          success: true,
        }),
      } as any);

    const spec = {
      indexes: [{ name: "articles", mappings: { title: { type: "text" as const } } }],
    };

    const plan = await client.config.plan(spec);
    expect(plan.hasChanges).toBe(true);

    const result = await client.config.apply(spec);
    expect(result.success).toBe(true);
  });
});
