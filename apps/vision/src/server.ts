import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { MultiModalVisionEngine, type VisionModelKind } from "./model.js";

export async function createVisionServer(options: {
  port?: number;
  modelKind?: VisionModelKind;
} = {}): Promise<FastifyInstance> {
  const modelKind = options.modelKind ?? (process.env.ANVESH_VISION_MODEL as VisionModelKind) ?? "mobileclip";
  const engine = new MultiModalVisionEngine(modelKind, 512);
  await engine.init();

  const app = Fastify({
    logger: false,
    bodyLimit: 10 * 1024 * 1024, // 10MB for base64 images
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, { origin: true });

  // 1. Health & Discovery Capabilities
  app.get("/health", async () => {
    return {
      ok: true,
      service: "anvesh-vision",
      product: "Anvesh Multi-Modal Vision Microservice",
      status: "ready",
      ...engine.capabilities,
    };
  });

  app.get("/v1/capabilities", async () => {
    return {
      ok: true,
      service: "anvesh-vision",
      ...engine.capabilities,
    };
  });

  // 2. Image Vector Embedding
  app.post("/v1/embed/image", async (req, reply) => {
    const body = req.body as { image?: string; bufferBase64?: string };
    if (!body?.image && !body?.bufferBase64) {
      return reply.status(400).send({
        ok: false,
        message: "Missing 'image' URL or 'bufferBase64' string.",
      });
    }

    const input = body.image || Buffer.from(body.bufferBase64!, "base64");
    const vector = await engine.embedImage(input);
    return {
      ok: true,
      dimensions: vector.length,
      model: engine.capabilities.modelKind,
      vector,
    };
  });

  // 3. Text Vector Embedding (Aligned in shared multi-modal space)
  app.post("/v1/embed/text", async (req, reply) => {
    const body = req.body as { text?: string; q?: string };
    const text = body?.text || body?.q;
    if (!text) {
      return reply.status(400).send({
        ok: false,
        message: "Missing 'text' parameter.",
      });
    }

    const vector = await engine.embedText(text);
    return {
      ok: true,
      dimensions: vector.length,
      model: engine.capabilities.modelKind,
      vector,
    };
  });

  return app;
}
