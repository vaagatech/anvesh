import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { PersistedIndex } from "../core/engine.js";
import type { StorageAdapter } from "./types.js";

export interface S3StorageOptions {
  bucket: string;
  prefix?: string;
  region?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

/** Object-store persistence — Lambda-friendly durable index blobs. */
export class S3Storage implements StorageAdapter {
  readonly name = "s3";
  private client: S3Client;
  private prefix: string;

  constructor(private readonly options: S3StorageOptions) {
    this.prefix = (options.prefix ?? "anvesh/indexes/").replace(/\/?$/, "/");
    this.client = new S3Client({
      region: options.region ?? process.env.ANVESH_S3_REGION ?? process.env.AWS_REGION ?? "us-east-1",
      ...(options.endpoint
        ? { endpoint: options.endpoint, forcePathStyle: options.forcePathStyle ?? true }
        : {}),
    });
  }

  private key(name: string): string {
    return `${this.prefix}${name}.json`;
  }

  async listIndexes(): Promise<string[]> {
    const names: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.options.bucket,
          Prefix: this.prefix,
          ContinuationToken: token,
        }),
      );
      for (const obj of res.Contents ?? []) {
        const key = obj.Key ?? "";
        if (!key.endsWith(".json")) continue;
        const base = key.slice(this.prefix.length).replace(/\.json$/, "");
        if (base && !base.includes("/")) names.push(base);
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return names.sort();
  }

  async loadIndex(name: string): Promise<PersistedIndex | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.options.bucket, Key: this.key(name) }),
      );
      const body = await res.Body?.transformToString();
      if (!body) return null;
      return JSON.parse(body) as PersistedIndex;
    } catch (err: unknown) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async saveIndex(name: string, data: PersistedIndex): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: this.key(name),
        Body: JSON.stringify(data),
        ContentType: "application/json",
      }),
    );
  }

  async deleteIndex(name: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.options.bucket, Key: this.key(name) }),
    );
  }

  async ping(): Promise<boolean> {
    await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.options.bucket,
        Prefix: this.prefix,
        MaxKeys: 1,
      }),
    );
    return true;
  }
}
