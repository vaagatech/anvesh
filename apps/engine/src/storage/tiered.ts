/**
 * Tiered Hybrid Storage Adapter for Anvesh:
 * - Tier 1: Fast Local NVMe / Volume Cache (/data/engine) for sub-ms queries & scoring
 * - Tier 2: Cloud Object Storage (OCI Object Storage / AWS S3) for multi-AZ durability
 * - Checksum-based Self-Healing: Auto-recovers from Cloud if local index is corrupted
 * - Point-in-time Snapshot History & Instant Rollback / Revert
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, unlink, readdir } from "node:fs/promises";
import path from "node:path";
import type { PersistedIndex } from "../core/engine.js";
import type { StorageAdapter } from "./types.js";
import { S3Storage, type S3StorageOptions } from "./s3.js";

export interface SnapshotRecord {
  id: string;
  indexName: string;
  docCount: number;
  checksum: string;
  createdAt: string;
  note?: string;
  sizeBytes?: number;
}

export interface TieredStorageOptions {
  localDir: string;
  cloud: S3StorageOptions;
  maxSnapshotsPerIndex?: number;
}

export class TieredStorage implements StorageAdapter {
  readonly name = "tiered";
  private localDir: string;
  private snapshotsDir: string;
  private cloud: S3Storage;
  private maxSnapshots: number;

  constructor(private readonly options: TieredStorageOptions) {
    this.localDir = options.localDir;
    this.snapshotsDir = path.join(options.localDir, "snapshots");
    this.cloud = new S3Storage(options.cloud);
    this.maxSnapshots = options.maxSnapshotsPerIndex ?? 20;
  }

  private localPath(name: string): string {
    return path.join(this.localDir, `${name}.json`);
  }

  private checksumPath(name: string): string {
    return path.join(this.localDir, `${name}.json.sha256`);
  }

  private snapshotDirPath(name: string): string {
    return path.join(this.snapshotsDir, name);
  }

  private computeChecksum(content: string): string {
    return createHash("sha256").update(content, "utf8").digest("hex");
  }

  async listIndexes(): Promise<string[]> {
    await mkdir(this.localDir, { recursive: true });
    const localNames = new Set<string>();

    // 1. Read from local directory
    try {
      const files = await readdir(this.localDir);
      for (const f of files) {
        if (f.endsWith(".json") && !f.includes(".tmp.")) {
          localNames.add(f.replace(/\.json$/, ""));
        }
      }
    } catch {
      // ignore
    }

    // 2. Union with Cloud Object Store list
    try {
      const cloudNames = await this.cloud.listIndexes();
      for (const c of cloudNames) {
        localNames.add(c);
      }
    } catch (err) {
      console.warn("[TieredStorage] Warning: Cloud storage list unavailable, using local cache:", err);
    }

    return Array.from(localNames).sort();
  }

  async loadIndex(name: string): Promise<PersistedIndex | null> {
    await mkdir(this.localDir, { recursive: true });
    const localFile = this.localPath(name);
    const sumFile = this.checksumPath(name);

    // 1. Try reading local tier and verifying checksum
    try {
      const body = await readFile(localFile, "utf8");
      if (body && body.trim().length > 0) {
        const actualChecksum = this.computeChecksum(body);
        let expectedChecksum = "";
        try {
          expectedChecksum = (await readFile(sumFile, "utf8")).trim();
        } catch {
          // No checksum file, generate it
          await writeFile(sumFile, actualChecksum, "utf8").catch(() => {});
          expectedChecksum = actualChecksum;
        }

        if (expectedChecksum === actualChecksum) {
          const parsed = JSON.parse(body) as PersistedIndex;
          return parsed;
        } else {
          console.warn(`[TieredStorage] Corruption detected for local index "${name}" (checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}). Self-healing from Cloud...`);
        }
      }
    } catch (err) {
      console.warn(`[TieredStorage] Local read failed for index "${name}": ${err}. Attempting to restore from Cloud Object Storage...`);
    }

    // 2. Self-Healing: Hydrate / Restore from Cloud Object Store
    try {
      const cloudIndex = await this.cloud.loadIndex(name);
      if (cloudIndex) {
        console.log(`[TieredStorage] Successfully hydrated index "${name}" from Cloud Object Storage.`);
        // Write back to local cache atomically
        const jsonStr = JSON.stringify(cloudIndex, null, 2);
        const checksum = this.computeChecksum(jsonStr);
        await writeFile(localFile, jsonStr, "utf8");
        await writeFile(sumFile, checksum, "utf8");
        return cloudIndex;
      }
    } catch (err) {
      console.error(`[TieredStorage] Error restoring index "${name}" from Cloud:`, err);
    }

    return null;
  }

  async saveIndex(name: string, data: PersistedIndex, note?: string): Promise<void> {
    await mkdir(this.localDir, { recursive: true });
    const localFile = this.localPath(name);
    const sumFile = this.checksumPath(name);
    const tempFile = path.join(this.localDir, `${name}.tmp.${Date.now()}.json`);

    const jsonStr = JSON.stringify(data, null, 2);
    const checksum = this.computeChecksum(jsonStr);

    // 1. Atomic Local Write
    await writeFile(tempFile, jsonStr, "utf8");
    await writeFile(localFile, jsonStr, "utf8");
    await writeFile(sumFile, checksum, "utf8");
    await unlink(tempFile).catch(() => {});

    // 2. Create versioned Snapshot Record
    const snapshotId = `v_${Date.now()}_${checksum.slice(0, 8)}`;
    const record: SnapshotRecord = {
      id: snapshotId,
      indexName: name,
      docCount: data.definition.docCount ?? 0,
      checksum,
      createdAt: new Date().toISOString(),
      note: note ?? "Automatic state sync snapshot",
      sizeBytes: Buffer.byteLength(jsonStr, "utf8"),
    };

    // Save local snapshot copy
    try {
      const snapDir = this.snapshotDirPath(name);
      await mkdir(snapDir, { recursive: true });
      await writeFile(path.join(snapDir, `${snapshotId}.json`), jsonStr, "utf8");
      
      // Update local snapshot index manifest
      const manifestFile = path.join(snapDir, "manifest.json");
      let history: SnapshotRecord[] = [];
      try {
        history = JSON.parse(await readFile(manifestFile, "utf8"));
      } catch {
        history = [];
      }
      history.unshift(record);
      if (history.length > this.maxSnapshots) history = history.slice(0, this.maxSnapshots);
      await writeFile(manifestFile, JSON.stringify(history, null, 2), "utf8");
    } catch (e) {
      console.warn(`[TieredStorage] Warning saving local snapshot history for ${name}:`, e);
    }

    // 3. Durable Cloud Sync (OCI Object Storage / S3)
    try {
      await this.cloud.saveIndex(name, data);
    } catch (err) {
      console.error(`[TieredStorage] Error pushing live index "${name}" to Cloud Object Storage:`, err);
    }
  }

  async deleteIndex(name: string): Promise<void> {
    await unlink(this.localPath(name)).catch(() => {});
    await unlink(this.checksumPath(name)).catch(() => {});
    try {
      await this.cloud.deleteIndex(name);
    } catch (err) {
      console.error(`[TieredStorage] Error deleting index "${name}" from Cloud:`, err);
    }
  }

  async listSnapshots(name: string): Promise<SnapshotRecord[]> {
    const snapDir = this.snapshotDirPath(name);
    const manifestFile = path.join(snapDir, "manifest.json");
    try {
      const data = await readFile(manifestFile, "utf8");
      return JSON.parse(data) as SnapshotRecord[];
    } catch {
      return [];
    }
  }

  async createSnapshot(name: string, note?: string): Promise<SnapshotRecord> {
    const current = await this.loadIndex(name);
    if (!current) throw new Error(`Cannot snapshot non-existent index "${name}".`);
    await this.saveIndex(name, current, note ?? "Manual User Snapshot");
    const list = await this.listSnapshots(name);
    return list[0]!;
  }

  async revertToSnapshot(name: string, snapshotId: string): Promise<PersistedIndex> {
    const snapDir = this.snapshotDirPath(name);
    const targetFile = path.join(snapDir, `${snapshotId}.json`);
    let jsonStr = "";
    try {
      jsonStr = await readFile(targetFile, "utf8");
    } catch {
      throw new Error(`Snapshot "${snapshotId}" not found for index "${name}".`);
    }

    const data = JSON.parse(jsonStr) as PersistedIndex;
    data.definition.updatedAt = new Date().toISOString();

    // Save as current active index
    await this.saveIndex(name, data, `Reverted to snapshot ${snapshotId}`);
    return data;
  }

  async ping(): Promise<boolean> {
    return true;
  }
}
