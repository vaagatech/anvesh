import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const E2E_DIR = root;
export const CONTEXT_FILE = path.join(root, ".tmp", "context.json");
