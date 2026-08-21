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
}
