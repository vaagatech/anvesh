#!/usr/bin/env node
import { createVisionServer } from "./server.js";

const port = Number(process.env.ANVESH_VISION_PORT || 3853);
const host = process.env.ANVESH_VISION_HOST || "0.0.0.0";

async function main() {
  const app = await createVisionServer({ port });
  await app.listen({ port, host });
  console.log(`👁️ Anvesh Multi-Modal Vision Microservice running on http://${host}:${port}`);
}

main().catch((err) => {
  console.error("Failed to start vision microservice:", err);
  process.exit(1);
});
