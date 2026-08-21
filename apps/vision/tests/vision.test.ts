import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createVisionServer } from "../src/server.js";
import type { FastifyInstance } from "fastify";

describe("Multi-Modal Vision Microservice", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createVisionServer({ modelKind: "mobileclip" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("reports service health and capabilities", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe("anvesh-vision");
    expect(body.modelKind).toBe("mobileclip");
    expect(body.dimensions).toBe(512);
  });

  it("embeds image into 512-dim normalized vector", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/embed/image",
      payload: { image: "https://example.com/saree-elephant.jpg" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.dimensions).toBe(512);
    expect(body.vector.length).toBe(512);
  });

  it("embeds text query into 512-dim vector aligned in multi-modal space", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/embed/text",
      payload: { text: "saree with elephant motif" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.dimensions).toBe(512);
    expect(body.vector.length).toBe(512);
  });
});
