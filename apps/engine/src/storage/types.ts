/**
 * Storage adapter contract — indexes persist as opaque JSON blobs.
 */

import type { PersistedIndex } from "../core/engine.js";

export interface StorageAdapter {
  readonly name: string;
  listIndexes(): Promise<string[]>;
  loadIndex(name: string): Promise<PersistedIndex | null>;
  saveIndex(name: string, data: PersistedIndex): Promise<void>;
  deleteIndex(name: string): Promise<void>;
  /** Optional readiness probe. */
  ping?(): Promise<boolean>;
}

export type StorageKind = "memory" | "filesystem" | "dfs" | "s3" | "oci" | "tiered" | "redis" | "dynamodb" | "mongodb";

export interface StorageFactoryOptions {
  kind: StorageKind;
  /** Filesystem root or local cache dir. */
  path?: string;
  /** DFS block size in MB. */
  blockSizeMb?: number;
  /** S3 / object store. */
  bucket?: string;
  prefix?: string;
  region?: string;
  endpoint?: string;
  /** Redis */
  redisUrl?: string;
  /** DynamoDB */
  tableName?: string;
  /** MongoDB */
  mongoUrl?: string;
  mongoDb?: string;
  mongoCollection?: string;
}
