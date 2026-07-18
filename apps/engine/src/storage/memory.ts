import type { PersistedIndex } from "../core/engine.js";
import type { StorageAdapter } from "./types.js";

/** Ephemeral storage — ideal for tests and single-invocation scratch indexes. */
export class MemoryStorage implements StorageAdapter {
  readonly name = "memory";
  private store = new Map<string, PersistedIndex>();

  async listIndexes(): Promise<string[]> {
    return [...this.store.keys()].sort();
  }

  async loadIndex(name: string): Promise<PersistedIndex | null> {
    return this.store.get(name) ?? null;
  }

  async saveIndex(name: string, data: PersistedIndex): Promise<void> {
    this.store.set(name, structuredClone(data));
  }

  async deleteIndex(name: string): Promise<void> {
    this.store.delete(name);
  }

  async ping(): Promise<boolean> {
    return true;
  }
}
