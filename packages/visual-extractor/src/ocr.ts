/**
 * Local Non-AI OCR Engine using dynamic Tesseract.js worker
 */

export interface OcrResult {
  text: string;
  confidence: number;
  lines: string[];
  words: string[];
}

function isValidImageInput(image: string | Buffer | Uint8Array): boolean {
  if (typeof image === "string") {
    return (
      image.startsWith("http://") ||
      image.startsWith("https://") ||
      image.startsWith("data:image/") ||
      image.endsWith(".png") ||
      image.endsWith(".jpg") ||
      image.endsWith(".jpeg") ||
      image.endsWith(".webp") ||
      image.endsWith(".bmp")
    );
  }
  if (Buffer.isBuffer(image) || image instanceof Uint8Array) {
    if (image.length < 8) return false;
    const isPng = image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47;
    const isJpg = image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
    const isBmp = image[0] === 0x42 && image[1] === 0x4d;
    const isRiff = image[0] === 0x52 && image[1] === 0x49 && image[2] === 0x46 && image[3] === 0x46;
    return isPng || isJpg || isBmp || isRiff;
  }
  return false;
}

export class LocalOcrEngine {
  private workerPromise: Promise<any> | null = null;

  private async getWorker() {
    if (!this.workerPromise) {
      this.workerPromise = (async () => {
        try {
          // Dynamic import to prevent hard build dependency
          // @ts-ignore
          const tesseract = await import("tesseract.js");
          const createWorker = tesseract.createWorker || tesseract.default?.createWorker;
          if (createWorker) {
            const worker = await createWorker("eng");
            return worker;
          }
          return null;
        } catch {
          return null;
        }
      })();
    }
    return this.workerPromise;
  }

  /**
   * Performs optical character recognition on an image buffer, URL, or filepath.
   */
  async recognize(image: string | Buffer | Uint8Array): Promise<OcrResult> {
    if (!isValidImageInput(image)) {
      return { text: "", confidence: 0, lines: [], words: [] };
    }

    try {
      const worker = await this.getWorker();
      if (!worker) {
        return { text: "", confidence: 0, lines: [], words: [] };
      }
      const ret = await worker.recognize(image);
      const text = ret.data.text ? ret.data.text.trim() : "";
      const lines = text
        .split("\n")
        .map((l: string) => l.trim())
        .filter(Boolean);
      const words = text
        .split(/\s+/)
        .map((w: string) => w.replace(/[^\w\s-]/g, "").trim())
        .filter(Boolean);

      return {
        text,
        confidence: Math.round(ret.data.confidence || 0),
        lines,
        words,
      };
    } catch {
      return {
        text: "",
        confidence: 0,
        lines: [],
        words: [],
      };
    }
  }

  async terminate(): Promise<void> {
    if (this.workerPromise) {
      const worker = await this.workerPromise;
      if (worker?.terminate) {
        await worker.terminate();
      }
      this.workerPromise = null;
    }
  }
}

export const globalOcrEngine = new LocalOcrEngine();
