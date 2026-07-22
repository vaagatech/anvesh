/// <reference types="vitest" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const packages = path.resolve(root, "../../packages");

export default defineConfig({
  resolve: {
    alias: {
      "@vaagatech/anvesh-plugins": path.resolve(packages, "plugins/src/index.ts"),
      "@vaagatech/vaakly": path.resolve(packages, "vaakly/src/index.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 15000,
  },
});
