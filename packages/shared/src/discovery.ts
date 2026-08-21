/**
 * Service Discovery & Capability Registry for Anvesh Fleet Microservices
 */

export interface VisionCapability {
  available: boolean;
  url: string;
  modelKind: "mobileclip" | "openclip";
  dimensions: number;
  quantized: boolean;
  device: string;
}

let cachedVision: { capability: VisionCapability | null; lastChecked: number } = {
  capability: null,
  lastChecked: 0,
};

/**
 * Discovers if the external Multi-Modal Vision Microservice is active and healthy.
 * Cached for 15 seconds to avoid network overhead.
 */
export async function discoverVisionService(
  customUrl?: string,
  timeoutMs = 1500
): Promise<VisionCapability | null> {
  const now = Date.now();
  if (cachedVision.lastChecked > 0 && now - cachedVision.lastChecked < 15000 && !customUrl) {
    return cachedVision.capability;
  }

  const visionUrl = (
    customUrl ||
    process.env.ANVESH_VISION_URL ||
    "http://127.0.0.1:3853"
  ).replace(/\/$/, "");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${visionUrl}/v1/capabilities`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = (await res.json()) as {
        ok: boolean;
        modelKind: "mobileclip" | "openclip";
        dimensions: number;
        quantized: boolean;
        device: string;
      };
      if (data?.ok) {
        const cap: VisionCapability = {
          available: true,
          url: visionUrl,
          modelKind: data.modelKind || "mobileclip",
          dimensions: data.dimensions || 512,
          quantized: Boolean(data.quantized),
          device: data.device || "cpu",
        };
        cachedVision = { capability: cap, lastChecked: now };
        return cap;
      }
    }
  } catch {
    // Service not running or unreachable
  }

  cachedVision = { capability: null, lastChecked: now };
  return null;
}

/**
 * Embeds an image via the discovered Vision microservice (if active).
 */
export async function embedImageWithDiscovery(
  imageInput: string | Buffer,
  visionCap?: VisionCapability | null
): Promise<number[] | null> {
  const cap = visionCap ?? (await discoverVisionService());
  if (!cap || !cap.available) return null;

  try {
    const payload = typeof imageInput === "string"
      ? { image: imageInput }
      : { bufferBase64: imageInput.toString("base64") };

    const res = await fetch(`${cap.url}/v1/embed/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = (await res.json()) as { ok: boolean; vector: number[] };
      return data.vector;
    }
  } catch {
    // Graceful fallback
  }

  return null;
}

/**
 * Embeds a text query via the discovered Vision microservice (if active).
 */
export async function embedTextWithDiscovery(
  text: string,
  visionCap?: VisionCapability | null
): Promise<number[] | null> {
  const cap = visionCap ?? (await discoverVisionService());
  if (!cap || !cap.available) return null;

  try {
    const res = await fetch(`${cap.url}/v1/embed/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (res.ok) {
      const data = (await res.json()) as { ok: boolean; vector: number[] };
      return data.vector;
    }
  } catch {
    // Graceful fallback
  }

  return null;
}
