import { Redis } from "ioredis";
import type { PersistedIndex } from "../core/engine.js";
import type { StorageAdapter } from "./types.js";

export interface RedisStorageOptions {
  url?: string;
  keyPrefix?: string;
}

/** Redis persistence — fast warm cache / shared state across containers. */
export class RedisStorage implements StorageAdapter {
  readonly name = "redis";
  private client: Redis;
  private prefix: string;

  constructor(options: RedisStorageOptions = {}) {
    this.prefix = options.keyPrefix ?? "anvesh:index:";
    this.client = new Redis(options.url ?? process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    });
  }

  private key(name: string): string {
    return `${this.prefix}${name}`;
  }

  private metaKey(): string {
    return `${this.prefix}__names`;
  }

  async listIndexes(): Promise<string[]> {
    const members = await this.client.smembers(this.metaKey());
    return members.sort();
  }

  async loadIndex(name: string): Promise<PersistedIndex | null> {
    const raw = await this.client.get(this.key(name));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedIndex;
  }

  async saveIndex(name: string, data: PersistedIndex): Promise<void> {
    const pipeline = this.client.pipeline();
    pipeline.set(this.key(name), JSON.stringify(data));
    pipeline.sadd(this.metaKey(), name);
    await pipeline.exec();
  }

  async deleteIndex(name: string): Promise<void> {
    const pipeline = this.client.pipeline();
    pipeline.del(this.key(name));
    pipeline.srem(this.metaKey(), name);
    await pipeline.exec();
  }

  async ping(): Promise<boolean> {
    const pong = await this.client.ping();
    return pong === "PONG";
  }

  async close(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}
