import { TieredStorage } from "./tiered.js";
import { MemoryStorage } from "./memory.js";
import { FilesystemStorage } from "./filesystem.js";
import { DfsStorage } from "./dfs.js";
import { S3Storage } from "./s3.js";
import { RedisStorage } from "./redis.js";
import { DynamoDBStorage } from "./dynamodb.js";
import { MongoStorage } from "./mongodb.js";
import type { StorageAdapter, StorageFactoryOptions } from "./types.js";
import { AnveshError } from "../messaging/vaakly.js";

export function createStorage(options: StorageFactoryOptions): StorageAdapter {
  switch (options.kind) {
    case "memory":
      return new MemoryStorage();
    case "filesystem":
      return new FilesystemStorage(options.path ?? process.env.ANVESH_DATA_DIR ?? ".anvesh/data");
    case "dfs":
      return new DfsStorage({
        path: options.path ?? process.env.ANVESH_DFS_PATH ?? ".anvesh/dfs",
        blockSizeMb: options.blockSizeMb,
      });
    case "tiered":
    case "oci":
      if (!options.bucket && !process.env.ANVESH_S3_BUCKET) {
        throw new AnveshError("ERR_VALIDATION", { detail: "Tiered/OCI storage requires bucket" });
      }
      return new TieredStorage({
        localDir: options.path ?? process.env.ANVESH_DATA_DIR ?? ".anvesh/data",
        cloud: {
          bucket: options.bucket ?? process.env.ANVESH_S3_BUCKET!,
          prefix: options.prefix ?? process.env.ANVESH_S3_PREFIX ?? "anvesh/indexes/",
          region: options.region ?? process.env.ANVESH_S3_REGION ?? "us-east-1",
          endpoint: options.endpoint ?? process.env.ANVESH_S3_ENDPOINT,
          forcePathStyle: true,
        },
      });
    case "s3":
      if (!options.bucket && !process.env.ANVESH_S3_BUCKET) {
        throw new AnveshError("ERR_VALIDATION", { detail: "S3 storage requires bucket" });
      }
      return new S3Storage({
        bucket: options.bucket ?? process.env.ANVESH_S3_BUCKET!,
        prefix: options.prefix ?? process.env.ANVESH_S3_PREFIX,
        region: options.region,
        endpoint: options.endpoint ?? process.env.ANVESH_S3_ENDPOINT,
      });
    case "redis":
      return new RedisStorage({
        url: options.redisUrl ?? process.env.REDIS_URL,
      });
    case "dynamodb":
      if (!options.tableName && !process.env.ANVESH_DDB_TABLE) {
        throw new AnveshError("ERR_VALIDATION", { detail: "DynamoDB storage requires tableName" });
      }
      return new DynamoDBStorage({
        tableName: options.tableName ?? process.env.ANVESH_DDB_TABLE!,
        region: options.region,
        endpoint: options.endpoint ?? process.env.ANVESH_DDB_ENDPOINT,
      });
    case "mongodb":
      if (!options.mongoUrl && !process.env.ANVESH_MONGO_URL) {
        throw new AnveshError("ERR_VALIDATION", { detail: "MongoDB storage requires mongoUrl" });
      }
      return new MongoStorage({
        url: options.mongoUrl ?? process.env.ANVESH_MONGO_URL!,
        dbName: options.mongoDb ?? process.env.ANVESH_MONGO_DB,
        collection: options.mongoCollection,
      });
    default:
      throw new AnveshError("ERR_VALIDATION", { detail: `unknown storage kind: ${options.kind}` });
  }
}

export * from "./types.js";
export * from "./memory.js";
export * from "./filesystem.js";
export * from "./dfs.js";
export * from "./s3.js";
export * from "./redis.js";
export * from "./dynamodb.js";
export * from "./mongodb.js";
export * from "./tiered.js";
