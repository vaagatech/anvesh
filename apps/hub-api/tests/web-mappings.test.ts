import { describe, expect, it, vi } from "vitest";
import { ensureWebIndex, WEB_MAPPINGS, WEB_SETTINGS } from "../src/web-mappings.js";

describe("ensureWebIndex", () => {
  it("skips create when index exists", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const res = await ensureWebIndex("http://engine:3848", "demo");
    expect(res.created).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("creates index with WEB_MAPPINGS when missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, status: 201 });
    vi.stubGlobal("fetch", fetchMock);
    const res = await ensureWebIndex("http://engine:3848", "new-web", "key");
    expect(res.created).toBe(true);
    const createCall = fetchMock.mock.calls[1]!;
    expect(createCall[0]).toBe("http://engine:3848/v1/indexes");
    const body = JSON.parse(createCall[1].body as string);
    expect(body.mappings).toEqual(WEB_MAPPINGS);
    expect(body.settings).toEqual(WEB_SETTINGS);
    expect(body.settings).toEqual(WEB_SETTINGS);
    vi.unstubAllGlobals();
  });
});
