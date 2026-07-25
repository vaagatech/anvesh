import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PersistedIndex } from "../core/engine.js";
import type { StorageAdapter } from "./types.js";
import { AnveshError } from "../messaging/vaakly.js";

export interface DfsStorageOptions {
  /** Root directory path for DFS mount / distributed share. */
  path?: string;
  /** Chunk block size in Megabytes for chunking large index files. Default 4MB. */
  blockSizeMb?: number;
}

export interface IndexManifest {
  name: string;
  totalSize: number;
  blockSizeBytes: number;
  totalParts: number;
  updatedAt: string;
}

/**
 * Distributed File System (DFS) Storage Adapter —
 * Manages chunked block storage for large scale / TB-scale indices.
 * Splits index snapshots into parallel part files and manifests.
 */
export class DfsStorage implements StorageAdapter {
  readonly name = "dfs";
  private readonly root: string;
  private readonly blockSizeBytes: number;

  constructor(options: DfsStorageOptions = {}) {
    this.root = options.path ?? process.env.ANVESH_DFS_PATH ?? ".anvesh/dfs";
    const mb = options.blockSizeMb ?? Number(process.env.ANVESH_DFS_BLOCK_SIZE_MB ?? 4);
    this.blockSizeBytes = Math.max(1, mb) * 1024 * 1024;
  }

  private dirForIndex(name: string): string {
    return path.join(this.root, name);
  }

  private manifestPath(name: string): string {
    return path.join(this.dirForIndex(name), "index.manifest.json");
  }

  private partPath(name: string, partIndex: number): string {
    const pad = String(partIndex).padStart(5, "0");
    return path.join(this.dirForIndex(name), `index.part-${pad}.json`);
  }

  async ensureRoot(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  async listIndexes(): Promise<string[]> {
    await this.ensureRoot();
    try {
      const entries = await readdir(this.root, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      const valid: string[] = [];
      for (const d of dirs) {
        try {
          await readFile(this.manifestPath(d));
          valid.push(d);
        } catch {
          /* skip invalid directories */
        }
      }
      return valid.sort();
    } catch {
      return [];
    }
  }

  async loadIndex(name: string): Promise<PersistedIndex | null> {
    try {
      const manifestRaw = await readFile(this.manifestPath(name), "utf8");
      const manifest: IndexManifest = JSON.parse(manifestRaw);

      const partPromises: Promise<string>[] = [];
      for (let i = 0; i < manifest.totalParts; i++) {
        partPromises.push(readFile(this.partPath(name, i), "utf8"));
      }

      const parts = await Promise.all(partPromises);
      const fullJson = parts.join("");
      return JSON.parse(fullJson) as PersistedIndex;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new AnveshError("ERR_STORAGE", {
        detail: `DFS load failed for index ${name}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  async saveIndex(name: string, data: PersistedIndex): Promise<void> {
    await this.ensureRoot();
    const indexDir = this.dirForIndex(name);
    await mkdir(indexDir, { recursive: true });

    const fullJson = JSON.stringify(data);
    const totalSize = Buffer.byteLength(fullJson, "utf8");
    const totalParts = Math.ceil(fullJson.length / this.blockSizeBytes) || 1;

    for (let i = 0; i < totalParts; i++) {
      const start = i * this.blockSizeBytes;
      const end = Math.min(fullJson.length, (i + 1) * this.blockSizeBytes);
      const chunk = fullJson.slice(start, end);
      await writeFile(this.partPath(name, i), chunk, "utf8");
    }

    const manifest: IndexManifest = {
      name,
      totalSize,
      blockSizeBytes: this.blockSizeBytes,
      totalParts,
      updatedAt: new Date().toISOString(),
    };

    await writeFile(this.manifestPath(name), JSON.stringify(manifest, null, 2), "utf8");
  }

  async deleteIndex(name: string): Promise<void> {
    try {
      const indexDir = this.dirForIndex(name);
      const entries = await readdir(indexDir);
      for (const file of entries) {
        await unlink(path.join(indexDir, file));
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async ping(): Promise<boolean> {
    await this.ensureRoot();
    return true;
  }
}
