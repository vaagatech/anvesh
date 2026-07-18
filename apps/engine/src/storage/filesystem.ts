import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PersistedIndex } from "../core/engine.js";
import type { StorageAdapter } from "./types.js";

/** Local/JSON file persistence — great for containers and local dev. */
export class FilesystemStorage implements StorageAdapter {
  readonly name = "filesystem";

  constructor(private readonly root: string) {}

  private fileFor(name: string): string {
    return path.join(this.root, `${name}.anvesh.json`);
  }

  async ensureRoot(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  async listIndexes(): Promise<string[]> {
    await this.ensureRoot();
    const entries = await readdir(this.root);
    return entries
      .filter((f) => f.endsWith(".anvesh.json"))
      .map((f) => f.replace(/\.anvesh\.json$/, ""))
      .sort();
  }

  async loadIndex(name: string): Promise<PersistedIndex | null> {
    try {
      const raw = await readFile(this.fileFor(name), "utf8");
      return JSON.parse(raw) as PersistedIndex;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async saveIndex(name: string, data: PersistedIndex): Promise<void> {
    await this.ensureRoot();
    const tmp = this.fileFor(name) + `.tmp-${process.pid}`;
    await writeFile(tmp, JSON.stringify(data), "utf8");
    await writeFile(this.fileFor(name), JSON.stringify(data), "utf8");
    try {
      await unlink(tmp);
    } catch {
      /* ignore */
    }
  }

  async deleteIndex(name: string): Promise<void> {
    try {
      await unlink(this.fileFor(name));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async ping(): Promise<boolean> {
    await this.ensureRoot();
    return true;
  }
}
