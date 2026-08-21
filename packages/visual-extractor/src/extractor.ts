/**
 * Unified Visual Feature & OCR Extraction Pipeline
 */

import { extractDominantColorsFromBuffer } from "./color.js";
import { analyzeMotifsFromBuffer, type MotifAnalysisResult } from "./motifs.js";
import { globalOcrEngine, type OcrResult } from "./ocr.js";

export interface VisualExtractionResult {
  ocr: OcrResult;
  colors: {
    dominant: string[];
    palette: Array<{ name: string; percentage: number }>;
  };
  motifs: MotifAnalysisResult;
  searchableText: string;
  tags: string[];
}

export class VisualExtractor {
  /**
   * Performs full non-AI visual extraction combining OCR, color palettes, and pattern descriptors.
   */
  async extract(
    image: string | Buffer | Uint8Array,
    pixelBuffer?: Uint8Array | Buffer,
    width = 100,
    height = 100
  ): Promise<VisualExtractionResult> {
    // 1. Run local OCR
    const ocr = await globalOcrEngine.recognize(image);

    // 2. Analyze colors from raw pixel buffer or fallback
    const rawBuffer = pixelBuffer ?? (Buffer.isBuffer(image) ? image : Buffer.alloc(width * height * 4, 128));
    const colors = extractDominantColorsFromBuffer(rawBuffer);

    // 3. Analyze motifs and patterns
    const motifs = analyzeMotifsFromBuffer(rawBuffer, width, height);

    // 4. Construct rich searchable text
    const textParts: string[] = [];
    if (ocr.text) textParts.push(ocr.text);
    if (colors.dominant.length > 0) textParts.push(`Colors: ${colors.dominant.join(", ")}`);
    if (motifs.motifs.length > 0) textParts.push(`Motifs: ${motifs.motifs.join(", ")}`);
    if (motifs.patternKeywords.length > 0) textParts.push(`Patterns: ${motifs.patternKeywords.join(" ")}`);

    const tags = Array.from(
      new Set([
        ...colors.dominant,
        ...motifs.motifs,
        ...motifs.patternKeywords,
        ...ocr.words.filter((w) => w.length > 3),
      ])
    );

    return {
      ocr,
      colors,
      motifs,
      searchableText: textParts.join(" | "),
      tags,
    };
  }
}

export const globalVisualExtractor = new VisualExtractor();
