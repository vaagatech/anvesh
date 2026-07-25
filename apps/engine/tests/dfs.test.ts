import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { DfsStorage } from "../src/storage/dfs.js";
import type { PersistedIndex } from "../src/core/engine.js";

describe("DfsStorage", () => {
  const testRoot = path.join(process.cwd(), ".anvesh-test-dfs");

  afterEach(async () => {
    try {
      await rm(testRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("chunks and reassembles index data in DFS storage", async () => {
    const dfs = new DfsStorage({ path: testRoot, blockSizeMb: 1 });

    const sampleIndex: PersistedIndex = {
      definition: {
        name: "test-dfs",
        mappings: { title: { type: "text" } },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        docCount: 1,
      },
      inverted: {
        postings: {},
        docLengths: {},
        documents: {
          "1": { id: "1", fields: { title: "Distributed File System Search Engine" } },
        },
        fieldDocFreq: {},
        avgFieldLength: {},
        docCount: 1,
      },
      vectors: null,
    };

    await dfs.saveIndex("test-dfs", sampleIndex);

    const list = await dfs.listIndexes();
    expect(list).toContain("test-dfs");

    const loaded = await dfs.loadIndex("test-dfs");
    expect(loaded).not.toBeNull();
    expect(loaded?.definition.name).toBe("test-dfs");
    expect(loaded?.inverted.documents["1"]?.fields.title).toBe(
      "Distributed File System Search Engine",
    );

    await dfs.deleteIndex("test-dfs");
    const reloaded = await dfs.loadIndex("test-dfs");
    expect(reloaded).toBeNull();
  });
});
