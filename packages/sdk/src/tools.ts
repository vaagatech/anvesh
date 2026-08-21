import type { TokenManager } from "./auth.js";
import type { OcrResult, VisualExtractionResult } from "./types.js";

export class ToolsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenManager: TokenManager
  ) {}

  async ocr(image: string): Promise<OcrResult> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/tools/ocr`, {
      method: "POST",
      headers,
      body: JSON.stringify({ image }),
    });
    if (!res.ok) throw new Error(`OCR extraction failed: ${await res.text()}`);
    const data = (await res.json()) as { ok: boolean; ocr: OcrResult };
    return data.ocr;
  }

  async extractVisual(options: { image?: string; bufferBase64?: string }): Promise<VisualExtractionResult> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/tools/visual-extract`, {
      method: "POST",
      headers,
      body: JSON.stringify(options),
    });
    if (!res.ok) throw new Error(`Visual extraction failed: ${await res.text()}`);
    return (await res.json()) as VisualExtractionResult;
  }

  async getImageMetadata(options: { image?: string; bufferBase64?: string }): Promise<import("./types.js").ImageMetadataResult> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/tools/image-metadata`, {
      method: "POST",
      headers,
      body: JSON.stringify(options),
    });
    if (!res.ok) throw new Error(`Image metadata extraction failed: ${await res.text()}`);
    const data = (await res.json()) as { ok: boolean; metadata: import("./types.js").ImageMetadataResult };
    return data.metadata;
  }

  async embedVisionImage(options: { image?: string; bufferBase64?: string; visionUrl?: string }): Promise<number[]> {
    const url = options.visionUrl || process.env.ANVESH_VISION_URL || "http://127.0.0.1:3853";
    const res = await fetch(`${url.replace(/\/$/, "")}/v1/embed/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
    if (!res.ok) throw new Error(`Vision image embedding failed: ${await res.text()}`);
    const data = (await res.json()) as { ok: boolean; vector: number[] };
    return data.vector;
  }

  async embedVisionText(text: string, visionUrl?: string): Promise<number[]> {
    const url = visionUrl || process.env.ANVESH_VISION_URL || "http://127.0.0.1:3853";
    const res = await fetch(`${url.replace(/\/$/, "")}/v1/embed/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`Vision text embedding failed: ${await res.text()}`);
    const data = (await res.json()) as { ok: boolean; vector: number[] };
    return data.vector;
  }
}
