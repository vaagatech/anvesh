import { mkdir, readdir, readFile, unlink, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PersistedIndex } from "../core/engine.js";
import type { StorageAdapter } from "./types.js";
import type { AnveshDocument, IndexDefinition } from "../types.js";

const SEGMENT_SIZE = 500;

/** Extract intact AnveshDocument objects from a corrupted JSON string */
function extractIntactDocuments(raw: string): Map<string, AnveshDocument> {
  const docs = new Map<string, AnveshDocument>();

  // Matches intact JSON object blocks {"id":"...","fields":...}
  const docRegex = /"([^"]+)":\s*(\{"id":\s*"[^"]+",\s*"fields":[\s\S]*?"updatedAt":\s*"[^"]+"\}\})/g;
  let match: RegExpExecArray | null;

  while ((match = docRegex.exec(raw)) !== null) {
    try {
      if (match[2]) {
        const docObj = JSON.parse(match[2]) as AnveshDocument;
        if (docObj && typeof docObj.id === "string" && docObj.fields) {
          docs.set(docObj.id, docObj);
        }
      }
    } catch {
      // Ignore truncated / incomplete match
    }
  }

  return docs;
}

/** Segmented Partitioned Storage Adapter with Inbuilt Self-Recovery */
export class FilesystemStorage implements StorageAdapter {
  readonly name = "filesystem";

  constructor(private readonly root: string) {}

  private dirFor(name: string): string {
    return path.join(this.root, `${name}.anvesh.dir`);
  }

  private legacyFileFor(name: string): string {
    return path.join(this.root, `${name}.anvesh.json`);
  }

  async ensureRoot(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  async listIndexes(): Promise<string[]> {
    await this.ensureRoot();
    const entries = await readdir(this.root);
    const names = new Set<string>();

    for (const f of entries) {
      if (f.endsWith(".anvesh.dir")) {
        names.add(f.replace(/\.anvesh\.dir$/, ""));
      } else if (f.endsWith(".anvesh.json")) {
        names.add(f.replace(/\.anvesh\.json$/, ""));
      } else if (f.includes(".anvesh.json.corrupt-") || f.includes(".anvesh.json.tmp-")) {
        const name = f.split(".anvesh.json.")[0];
        if (name) names.add(name);
      }
    }

    return Array.from(names).sort();
  }

  async loadIndex(name: string): Promise<PersistedIndex | null> {
    await this.ensureRoot();
    const dir = this.dirFor(name);

    // ── 1. Load from Segmented Directory Layout ──
    try {
      const metaRaw = await readFile(path.join(dir, "meta.json"), "utf8");
      const meta = JSON.parse(metaRaw) as {
        definition: IndexDefinition;
        vectorDimensions?: number;
      };

      const segmentsDir = path.join(dir, "segments");
      const segFiles = (await readdir(segmentsDir)).filter((f) => f.endsWith(".json")).sort();

      const recoveredDocs = new Map<string, AnveshDocument>();
      const recoveredVectors: Record<string, number[]> = {};

      for (const file of segFiles) {
        const segPath = path.join(segmentsDir, file);
        try {
          const raw = await readFile(segPath, "utf8");
          const seg = JSON.parse(raw) as {
            documents: Record<string, AnveshDocument>;
            vectors?: Record<string, number[]>;
          };
          for (const [id, doc] of Object.entries(seg.documents ?? {})) {
            recoveredDocs.set(id, doc);
          }
          if (seg.vectors) {
            Object.assign(recoveredVectors, seg.vectors);
          }
        } catch {
          // Self-Recovery for corrupted segment file
          const raw = await readFile(segPath, "utf8").catch(() => "");
          const rescued = extractIntactDocuments(raw);
          for (const [id, doc] of rescued) {
            recoveredDocs.set(id, doc);
            if (doc.vector) recoveredVectors[id] = doc.vector;
          }
        }
      }

      return this.buildPersistedFromDocs(meta.definition, recoveredDocs, recoveredVectors);
    } catch {
      /* Fallback to legacy file or corrupt snapshot recovery */
    }

    // ── 2. Legacy File & Corrupt Snapshot Self-Recovery ──
    const legacyFile = this.legacyFileFor(name);
    let targetFileToRecover = legacyFile;

    try {
      const raw = await readFile(legacyFile, "utf8");
      const parsed = JSON.parse(raw) as PersistedIndex;
      // Auto-migrate intact legacy file to segmented partition layout
      await this.saveIndex(name, parsed);
      return parsed;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        // Look for any corrupt snapshot files from prior interrupted runs
        const entries = await readdir(this.root).catch(() => []);
        const corruptMatch = entries.find(
          (e) => e.startsWith(`${name}.anvesh.json.corrupt-`) || e.startsWith(`${name}.anvesh.json.tmp-`),
        );
        if (corruptMatch) {
          targetFileToRecover = path.join(this.root, corruptMatch);
        } else {
          return null;
        }
      }
    }

    // ── 3. Granular Document Self-Recovery Scanner ──
    try {
      const raw = await readFile(targetFileToRecover, "utf8");
      const rescued = extractIntactDocuments(raw);

      if (rescued.size === 0) return null;

      const fallbackDefinition: IndexDefinition = {
        name,
        mappings: {},
        settings: { dynamicMapping: true, vectorDimensions: 384 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        docCount: rescued.size,
      };

      const recoveredVectors: Record<string, number[]> = {};
      for (const [id, doc] of rescued) {
        if (doc.vector) recoveredVectors[id] = doc.vector;
      }

      const recoveredIndex = this.buildPersistedFromDocs(
        fallbackDefinition,
        rescued,
        recoveredVectors,
      );

      // Auto-migrate and save clean partitioned layout
      await this.saveIndex(name, recoveredIndex);
      return recoveredIndex;
    } catch {
      return null;
    }
  }

  async saveIndex(name: string, data: PersistedIndex): Promise<void> {
    await this.ensureRoot();
    const dir = this.dirFor(name);
    const segmentsDir = path.join(dir, "segments");
    await mkdir(segmentsDir, { recursive: true });

    // 1. Save Meta file atomically
    const metaPath = path.join(dir, "meta.json");
    const metaTmp = `${metaPath}.tmp-${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const metaContent = JSON.stringify(
      {
        definition: data.definition,
        vectorDimensions: data.vectors?.dimensions ?? 384,
        savedAt: new Date().toISOString(),
      },
      null,
      2,
    );
    await writeFile(metaTmp, metaContent, "utf8");
    await rename(metaTmp, metaPath);

    // 2. Partition documents into bounded segment files
    const docs = Object.values(data.inverted?.documents ?? {});
    const vectors = data.vectors?.vectors ?? {};

    const totalSegments = Math.ceil(docs.length / SEGMENT_SIZE) || 1;

    for (let i = 0; i < totalSegments; i++) {
      const chunkDocs = docs.slice(i * SEGMENT_SIZE, (i + 1) * SEGMENT_SIZE);
      const segDocMap: Record<string, AnveshDocument> = {};
      const segVecMap: Record<string, number[]> = {};

      for (const d of chunkDocs) {
        segDocMap[d.id] = d;
        if (vectors[d.id]) segVecMap[d.id] = vectors[d.id]!;
      }

      const segName = `segment-${String(i + 1).padStart(4, "0")}.json`;
      const segPath = path.join(segmentsDir, segName);
      const segTmp = `${segPath}.tmp-${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}`;
      await writeFile(
        segTmp,
        JSON.stringify({ documents: segDocMap, vectors: segVecMap }),
        "utf8",
      );
      await rename(segTmp, segPath);
    }

    // 3. Remove stale segment files
    const existing = await readdir(segmentsDir);
    for (const f of existing) {
      if (f.startsWith("segment-") && f.endsWith(".json")) {
        const num = parseInt(f.replace("segment-", "").replace(".json", ""), 10);
        if (num > totalSegments) {
          await unlink(path.join(segmentsDir, f)).catch(() => undefined);
        }
      }
    }

    // Also write monolithic backup atomically
    const legacyTarget = this.legacyFileFor(name);
    const legacyTmp = `${legacyTarget}.tmp-${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    await writeFile(legacyTmp, JSON.stringify(data), "utf8");
    await rename(legacyTmp, legacyTarget);
  }

  async deleteIndex(name: string): Promise<void> {
    await rm(this.dirFor(name), { recursive: true, force: true }).catch(() => undefined);
    await unlink(this.legacyFileFor(name)).catch(() => undefined);
  }

  async ping(): Promise<boolean> {
    await this.ensureRoot();
    return true;
  }

  private buildPersistedFromDocs(
    def: IndexDefinition,
    docsMap: Map<string, AnveshDocument>,
    vectorsMap: Record<string, number[]>,
  ): PersistedIndex {
    const documents: Record<string, AnveshDocument> = {};
    for (const [id, doc] of docsMap) documents[id] = doc;

    const docCount = docsMap.size;
    def.docCount = docCount;

    return {
      definition: def,
      inverted: {
        postings: {},
        docLengths: {},
        documents,
        fieldDocFreq: {},
        avgFieldLength: {},
        docCount,
      },
      vectors: Object.keys(vectorsMap).length
        ? {
            dimensions: def.settings?.vectorDimensions ?? 384,
            metric: def.settings?.vectorMetric ?? "cosine",
            indexType: def.settings?.vectorIndexType ?? "flat",
            quantization: def.settings?.vectorQuantization ?? "none",
            vectors: vectorsMap,
          }
        : null,
    };
  }
}
