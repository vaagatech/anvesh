import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { PersistedIndex } from "../core/engine.js";
import type { StorageAdapter } from "./types.js";

export interface DynamoStorageOptions {
  tableName: string;
  region?: string;
  endpoint?: string;
  pkAttribute?: string;
}

/**
 * DynamoDB persistence.
 * Table schema: pk (S) = index name, payload (S) = JSON blob.
 */
export class DynamoDBStorage implements StorageAdapter {
  readonly name = "dynamodb";
  private doc: DynamoDBDocumentClient;
  private pk: string;

  constructor(private readonly options: DynamoStorageOptions) {
    const client = new DynamoDBClient({
      region: options.region ?? process.env.AWS_REGION ?? "us-east-1",
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
    });
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
    this.pk = options.pkAttribute ?? "pk";
  }

  async listIndexes(): Promise<string[]> {
    const names: string[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const res = await this.doc.send(
        new ScanCommand({
          TableName: this.options.tableName,
          ProjectionExpression: "#pk",
          ExpressionAttributeNames: { "#pk": this.pk },
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of res.Items ?? []) {
        const name = item[this.pk];
        if (typeof name === "string") names.push(name);
      }
      startKey = res.LastEvaluatedKey;
    } while (startKey);
    return names.sort();
  }

  async loadIndex(name: string): Promise<PersistedIndex | null> {
    const res = await this.doc.send(
      new GetCommand({
        TableName: this.options.tableName,
        Key: { [this.pk]: name },
      }),
    );
    if (!res.Item?.payload) return null;
    return typeof res.Item.payload === "string"
      ? (JSON.parse(res.Item.payload) as PersistedIndex)
      : (res.Item.payload as PersistedIndex);
  }

  async saveIndex(name: string, data: PersistedIndex): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.options.tableName,
        Item: {
          [this.pk]: name,
          payload: JSON.stringify(data),
          updatedAt: new Date().toISOString(),
        },
      }),
    );
  }

  async deleteIndex(name: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({
        TableName: this.options.tableName,
        Key: { [this.pk]: name },
      }),
    );
  }

  async ping(): Promise<boolean> {
    await this.doc.send(
      new ScanCommand({ TableName: this.options.tableName, Limit: 1 }),
    );
    return true;
  }
}
