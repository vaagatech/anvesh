/**
 * Universal Dead-Letter Queue and Replay Manager for Anvesh.
 * Isolates failed records during indexing, crawling, or ingestion so batch
 * operations never abort, and provides persistent storage and replay capabilities.
 * VaagaTech · https://www.vaagatech.com
 */
import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

export interface DeadLetterEntry {
  id: string;
  recordId?: string;
  source: "engine" | "spider" | "indexer" | "hub";
  targetIndex?: string;
  timestamp: string;
  error: {
    message: string;
    code?: string;
    stack?: string;
  };
  payload: unknown;
  meta?: Record<string, unknown>;
  replayed?: boolean;
  replayedAt?: string;
}

export class DeadLetterRecorder {
  private buffer: DeadLetterEntry[] = [];
  private ringBuffer: DeadLetterEntry[] = [];
  private maxRingBufferSize = 500;
  private dataDir: string;
  private flushTimer: NodeJS.Timeout | null = null;
  private totalRecorded = 0;

  constructor(baseDataDir = process.env.ANVESH_DATA_DIR || "/data/engine") {
    this.dataDir = join(baseDataDir, "..", "dead-letter");
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        // Silently log without throwing to protect application runtime
        console.error("[DeadLetter] Background flush error:", err instanceof Error ? err.message : String(err));
      });
    }, 4000);
    this.flushTimer.unref?.();
  }

  /**
   * Record a single failed record for replay and debugging.
   */
  record(entry: {
    recordId?: string;
    source: "engine" | "spider" | "indexer" | "hub";
    targetIndex?: string;
    error: Error | string | { message: string; code?: string; stack?: string };
    payload: unknown;
    meta?: Record<string, unknown>;
  }): DeadLetterEntry {
    const errorObj =
      typeof entry.error === "string"
        ? { message: entry.error }
        : entry.error instanceof Error
        ? {
            message: entry.error.message,
            code: (entry.error as any).code,
            stack: entry.error.stack,
          }
        : {
            message: entry.error.message || "Unknown record failure",
            code: entry.error.code,
            stack: entry.error.stack,
          };

    const record: DeadLetterEntry = {
      id: `dlq_${Date.now()}_${randomUUID().slice(0, 8)}`,
      recordId: entry.recordId,
      source: entry.source,
      targetIndex: entry.targetIndex,
      timestamp: new Date().toISOString(),
      error: errorObj,
      payload: entry.payload,
      meta: entry.meta,
    };

    this.buffer.push(record);
    this.totalRecorded += 1;

    // Keep recent entries in memory ring buffer for fast query / UI inspection
    this.ringBuffer.unshift(record);
    if (this.ringBuffer.length > this.maxRingBufferSize) {
      this.ringBuffer.pop();
    }

    if (this.buffer.length >= 50) {
      this.flush().catch(() => {});
    }

    return record;
  }

  /**
   * Flush in-memory buffer to append-only daily JSONL file.
   */
  async flush(): Promise<void> {
    if (!this.buffer.length) return;
    const batch = [...this.buffer];
    this.buffer = [];

    const dateStr = new Date().toISOString().slice(0, 10);
    const filePath = join(this.dataDir, `dead-letter-${dateStr}.jsonl`);

    try {
      await mkdir(this.dataDir, { recursive: true });
      const payload = batch.map((e) => JSON.stringify(e)).join("\n") + "\n";
      await appendFile(filePath, payload, "utf8");
    } catch (err) {
      // Re-queue on write failure to prevent data loss
      this.buffer.unshift(...batch);
    }
  }

  /**
   * Get recent dead-letter entries from memory and/or disk.
   */
  async getRecent(options: {
    source?: "engine" | "spider" | "indexer" | "hub";
    targetIndex?: string;
    limit?: number;
  } = {}): Promise<{ total: number; entries: DeadLetterEntry[] }> {
    await this.flush();

    const limit = Math.min(options.limit ?? 50, 200);
    let filtered = this.ringBuffer;

    if (options.source) {
      filtered = filtered.filter((e) => e.source === options.source);
    }
    if (options.targetIndex) {
      filtered = filtered.filter((e) => e.targetIndex === options.targetIndex);
    }

    return {
      total: this.totalRecorded,
      entries: filtered.slice(0, limit),
    };
  }

  /**
   * Clear in-memory buffer (for testing or maintenance).
   */
  clearMemory(): void {
    this.buffer = [];
    this.ringBuffer = [];
  }

  /**
   * Return stats for telemetry / metrics.
   */
  stats(): { totalRecorded: number; pendingFlush: number; inMemoryCount: number } {
    return {
      totalRecorded: this.totalRecorded,
      pendingFlush: this.buffer.length,
      inMemoryCount: this.ringBuffer.length,
    };
  }
}

export const globalDeadLetter = new DeadLetterRecorder();
