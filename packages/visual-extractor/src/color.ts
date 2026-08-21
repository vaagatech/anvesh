/**
 * Color Palette & Dominant Hue Extractor for Images
 */

export interface ColorToken {
  name: string;
  category: string;
  hex: string;
  r: number;
  g: number;
  b: number;
}

export const TEXTILE_COLOR_PALETTE: ColorToken[] = [
  { name: "Gold Zari", category: "Metallic", hex: "#D4AF37", r: 212, g: 175, b: 55 },
  { name: "Copper Bronze", category: "Metallic", hex: "#B87333", r: 184, g: 115, b: 51 },
  { name: "Silver Zari", category: "Metallic", hex: "#C0C0C0", r: 192, g: 192, b: 192 },
  { name: "Royal Blue", category: "Blue", hex: "#4169E1", r: 65, g: 105, b: 225 },
  { name: "Navy Blue", category: "Blue", hex: "#000080", r: 0, g: 0, b: 128 },
  { name: "Peacock Blue", category: "Blue", hex: "#005F73", r: 0, g: 95, b: 115 },
  { name: "Indigo Blue", category: "Blue", hex: "#4B0082", r: 75, g: 0, b: 130 },
  { name: "Sky Blue", category: "Blue", hex: "#87CEEB", r: 135, g: 206, b: 235 },
  { name: "Crimson Red", category: "Red", hex: "#DC143C", r: 220, g: 20, b: 60 },
  { name: "Maroon", category: "Red", hex: "#800000", r: 128, g: 0, b: 0 },
  { name: "Sindoor Red", category: "Red", hex: "#CB2821", r: 203, g: 40, b: 33 },
  { name: "Rani Pink", category: "Pink", hex: "#E91E63", r: 233, g: 30, b: 99 },
  { name: "Magenta", category: "Pink", hex: "#FF00FF", r: 255, g: 0, b: 255 },
  { name: "Mauve", category: "Pink", hex: "#E0B0FF", r: 224, g: 176, b: 255 },
  { name: "Peach Coral", category: "Orange", hex: "#F88379", r: 248, g: 131, b: 121 },
  { name: "Rust Orange", category: "Orange", hex: "#C45B28", r: 196, g: 91, b: 40 },
  { name: "Mustard Yellow", category: "Yellow", hex: "#E1AD01", r: 225, g: 173, b: 1 },
  { name: "Haldi Yellow", category: "Yellow", hex: "#FFD700", r: 255, g: 215, b: 0 },
  { name: "Emerald Green", category: "Green", hex: "#50C878", r: 80, g: 200, b: 120 },
  { name: "Bottle Green", category: "Green", hex: "#004225", r: 0, g: 66, b: 37 },
  { name: "Mehendi Olive", category: "Green", hex: "#808000", r: 128, g: 128, b: 0 },
  { name: "Mint Green", category: "Green", hex: "#98FF98", r: 152, g: 255, b: 152 },
  { name: "Deep Purple", category: "Purple", hex: "#36013F", r: 54, g: 1, b: 63 },
  { name: "Dark Chocolate Brown", category: "Brown", hex: "#3D2314", r: 61, g: 35, b: 20 },
  { name: "Off White Cream", category: "Neutral", hex: "#FAF9F6", r: 250, g: 249, b: 246 },
  { name: "Jet Black", category: "Neutral", hex: "#0A0A0A", r: 10, g: 10, b: 10 },
];

function colorDistanceSq(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

export function matchNearestColor(r: number, g: number, b: number): ColorToken {
  let nearest = TEXTILE_COLOR_PALETTE[0]!;
  let minDist = Infinity;

  for (const token of TEXTILE_COLOR_PALETTE) {
    const dist = colorDistanceSq(r, g, b, token.r, token.g, token.b);
    if (dist < minDist) {
      minDist = dist;
      nearest = token;
    }
  }

  return nearest;
}

/**
 * Extracts dominant color names from a raw RGB/RGBA pixel buffer.
 */
export function extractDominantColorsFromBuffer(
  buffer: Uint8Array | Buffer,
  stride = 4, // 3 for RGB, 4 for RGBA
  samples = 1000
): { dominant: string[]; palette: Array<{ name: string; percentage: number }> } {
  if (buffer.length < stride) {
    return { dominant: [], palette: [] };
  }

  const totalPixels = Math.floor(buffer.length / stride);
  const step = Math.max(1, Math.floor(totalPixels / samples));
  const counts = new Map<string, number>();
  let counted = 0;

  for (let i = 0; i < totalPixels; i += step) {
    const idx = i * stride;
    const r = buffer[idx] ?? 0;
    const g = buffer[idx + 1] ?? 0;
    const b = buffer[idx + 2] ?? 0;
    const a = stride === 4 ? buffer[idx + 3] ?? 255 : 255;

    // Skip transparent pixels
    if (a < 50) continue;

    const matched = matchNearestColor(r, g, b);
    counts.set(matched.name, (counts.get(matched.name) ?? 0) + 1);
    counted++;
  }

  const sorted = [...counts.entries()]
    .map(([name, count]) => ({
      name,
      percentage: counted > 0 ? Math.round((count / counted) * 100) : 0,
    }))
    .sort((a, b) => b.percentage - a.percentage);

  const dominant = sorted.slice(0, 4).map((c) => c.name);
  return { dominant, palette: sorted.slice(0, 6) };
}
