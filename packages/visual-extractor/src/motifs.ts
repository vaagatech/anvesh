/**
 * Non-AI Motif, Texture & Pattern Descriptor Engine
 */

export interface MotifAnalysisResult {
  motifs: string[];
  textureType: "plain" | "butta_scattered" | "heavy_zari" | "checks_stripes" | "figural_floral";
  edgeDensity: number;
  patternKeywords: string[];
}

/**
 * Computes luminance of an RGB pixel.
 */
function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Performs fast gradient and spatial frequency analysis on a pixel grid.
 */
export function analyzeMotifsFromBuffer(
  buffer: Uint8Array | Buffer,
  width = 100,
  height = 100,
  channels = 4
): MotifAnalysisResult {
  if (buffer.length < width * height * channels) {
    return {
      motifs: ["solid"],
      textureType: "plain",
      edgeDensity: 0,
      patternKeywords: ["plain", "solid"],
    };
  }

  let totalEdges = 0;
  let horizontalGradients = 0;
  let verticalGradients = 0;
  let highContrastClusters = 0;
  let totalEvaluated = 0;

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const idx = (y * width + x) * channels;
      const r = buffer[idx] ?? 0;
      const g = buffer[idx + 1] ?? 0;
      const b = buffer[idx + 2] ?? 0;
      const currentLum = luminance(r, g, b);

      // Neighbor to right
      const rIdx = (y * width + (x + 1)) * channels;
      const rLum = luminance(buffer[rIdx] ?? 0, buffer[rIdx + 1] ?? 0, buffer[rIdx + 2] ?? 0);
      const dx = Math.abs(currentLum - rLum);

      // Neighbor below
      const bIdx = ((y + 1) * width + x) * channels;
      const bLum = luminance(buffer[bIdx] ?? 0, buffer[bIdx + 1] ?? 0, buffer[bIdx + 2] ?? 0);
      const dy = Math.abs(currentLum - bLum);

      const grad = Math.sqrt(dx * dx + dy * dy);
      if (grad > 35) {
        totalEdges++;
        if (dx > 40) horizontalGradients++;
        if (dy > 40) verticalGradients++;
        if (grad > 70) highContrastClusters++;
      }
      totalEvaluated++;
    }
  }

  const edgeDensity = totalEvaluated > 0 ? totalEdges / totalEvaluated : 0;
  const isHighContrast = highContrastClusters > (totalEdges * 0.4);

  const motifs: string[] = [];
  const patternKeywords: string[] = [];
  let textureType: MotifAnalysisResult["textureType"] = "plain";

  if (edgeDensity < 0.08) {
    textureType = "plain";
    motifs.push("Plain Weave", "Solid Finish");
    patternKeywords.push("plain", "solid", "minimal", "smooth");
  } else if (edgeDensity < 0.25) {
    textureType = "butta_scattered";
    motifs.push("Small Buttas", "Zari Dots", "Scatter Print");
    patternKeywords.push("butta", "scattered", "dots", "subtle zari", "bootis");
  } else if (Math.abs(horizontalGradients - verticalGradients) < (totalEdges * 0.15) && isHighContrast) {
    textureType = "checks_stripes";
    motifs.push("Kattam Checks", "Temple Border Checks", "Geometric Grid");
    patternKeywords.push("checks", "stripes", "grid", "kattam", "geometric");
  } else if (edgeDensity > 0.45) {
    textureType = "heavy_zari";
    motifs.push("Heavy Zari Pallu", "Ganga Jamuna Border", "Broad Temple Border");
    patternKeywords.push("heavy zari", "rich pallu", "temple border", "ornate", "festive border");
  } else {
    textureType = "figural_floral";
    motifs.push("Floral Jaal", "Paisley Mango Motif", "Peacock / Elephant Silhouette Motif");
    patternKeywords.push("floral", "paisley", "mango", "kalka", "peacock", "elephant", "traditional motif", "figural");
  }

  return {
    motifs,
    textureType,
    edgeDensity: Math.round(edgeDensity * 100) / 100,
    patternKeywords,
  };
}
