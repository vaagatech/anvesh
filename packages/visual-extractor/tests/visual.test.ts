import { describe, it, expect } from "vitest";
import { matchNearestColor, extractDominantColorsFromBuffer } from "../src/color.js";
import { analyzeMotifsFromBuffer } from "../src/motifs.js";
import { VisualExtractor } from "../src/extractor.js";

describe("Visual Feature & OCR Extractor", () => {
  it("matches nearest textile color accurately", () => {
    // Red color
    const red = matchNearestColor(220, 20, 60);
    expect(red.name).toBe("Crimson Red");

    // Gold color
    const gold = matchNearestColor(212, 175, 55);
    expect(gold.name).toBe("Gold Zari");

    // Royal Blue
    const blue = matchNearestColor(65, 105, 225);
    expect(blue.name).toBe("Royal Blue");
  });

  it("extracts dominant colors from pixel buffer", () => {
    // Create a 10x10 buffer filled with Gold Zari (212, 175, 55, 255)
    const buf = Buffer.alloc(10 * 10 * 4);
    for (let i = 0; i < 100; i++) {
      buf[i * 4] = 212;
      buf[i * 4 + 1] = 175;
      buf[i * 4 + 2] = 55;
      buf[i * 4 + 3] = 255;
    }

    const { dominant, palette } = extractDominantColorsFromBuffer(buf);
    expect(dominant).toContain("Gold Zari");
    expect(palette[0]!.percentage).toBe(100);
  });

  it("classifies motifs and texture types based on edge frequency", () => {
    // Plain buffer
    const plainBuf = Buffer.alloc(50 * 50 * 4, 128);
    const plainResult = analyzeMotifsFromBuffer(plainBuf, 50, 50);
    expect(plainResult.textureType).toBe("plain");
    expect(plainResult.patternKeywords).toContain("plain");

    // Checkered high-gradient buffer
    const checkBuf = Buffer.alloc(50 * 50 * 4);
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        const val = (Math.floor(x / 5) + Math.floor(y / 5)) % 2 === 0 ? 255 : 0;
        const idx = (y * 50 + x) * 4;
        checkBuf[idx] = val;
        checkBuf[idx + 1] = val;
        checkBuf[idx + 2] = val;
        checkBuf[idx + 3] = 255;
      }
    }

    const checkResult = analyzeMotifsFromBuffer(checkBuf, 50, 50);
    expect(["checks_stripes", "heavy_zari", "figural_floral"]).toContain(checkResult.textureType);
  });

  it("generates searchable tags and text combining OCR and visual features", async () => {
    const extractor = new VisualExtractor();
    const buf = Buffer.alloc(20 * 20 * 4, 200);

    const result = await extractor.extract(buf, buf, 20, 20);
    expect(result.colors).toBeDefined();
    expect(result.motifs).toBeDefined();
    expect(result.tags.length).toBeGreaterThan(0);
    expect(typeof result.searchableText).toBe("string");
  });
});
