import { MongoClient, type Collection, type Db } from "mongodb";
import type { PersistedIndex } from "../core/engine.js";
import type { StorageAdapter } from "./types.js";

export interface MongoStorageOptions {
  url: string;
  dbName?: string;
  collection?: string;
}

/** MongoDB persistence — document store for index blobs. */
export class MongoStorage implements StorageAdapter {
  readonly name = "mongodb";
  private client: MongoClient;
  private dbName: string;
  private collectionName: string;
  private ready: Promise<void>;

  constructor(options: MongoStorageOptions) {
    this.client = new MongoClient(options.url);
    this.dbName = options.dbName ?? "anvesh";
    this.collectionName = options.collection ?? "indexes";
    this.ready = this.client.connect().then(() => undefined);
  }

  private async col(): Promise<Collection> {
    await this.ready;
    const db: Db = this.client.db(this.dbName);
    return db.collection(this.collectionName);
  }

  async listIndexes(): Promise<string[]> {
    const col = await this.col();
    const docs = await col.find({}, { projection: { _id: 1 } }).toArray();
    return docs.map((d) => String(d._id)).sort();
  }

  async loadIndex(name: string): Promise<PersistedIndex | null> {
    const col = await this.col();
    const doc = await col.findOne({ _id: name as never });
    if (!doc?.payload) return null;
    return doc.payload as PersistedIndex;
  }

  async saveIndex(name: string, data: PersistedIndex): Promise<void> {
    const col = await this.col();
    await col.updateOne(
      { _id: name as never },
      { $set: { payload: data, updatedAt: new Date() } },
      { upsert: true },
    );
  }

  async deleteIndex(name: string): Promise<void> {
    const col = await this.col();
    await col.deleteOne({ _id: name as never });
  }

  async ping(): Promise<boolean> {
    await this.ready;
    await this.client.db(this.dbName).command({ ping: 1 });
    return true;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
