import { describe, expect, it } from "vitest";
import { unwrapIndex, unwrapMappings } from "../src/unwrap.js";

describe("unwrapIndex / unwrapMappings", () => {
  it("unwraps engine { index: { mappings } } envelopes", () => {
    const json = {
      ok: true,
      index: {
        name: "web",
        mappings: { title: { type: "text" }, url: { type: "keyword" } },
      },
    };
    expect(unwrapIndex(json).name).toBe("web");
    expect(unwrapMappings(json)?.title?.type).toBe("text");
  });

  it("accepts bare index objects", () => {
    const json = { name: "web", mappings: { body: { type: "text" } } };
    expect(unwrapMappings(json)?.body?.type).toBe("text");
  });

  it("returns undefined when mappings missing", () => {
    expect(unwrapMappings({ ok: true, index: { name: "x" } })).toBeUndefined();
  });
});
