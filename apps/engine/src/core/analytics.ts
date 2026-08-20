/**
 * Filesystem-backed Analytics Engine for Anvesh.
 * Stores search queries, clickthroughs, latency histograms, and zero-result queries
 * in daily append-only JSONL files on /data/analytics.
 */
import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface QueryEvent {
  type: "query";
  timestamp: string;
  index: string;
  query: string;
  mode: string;
  tookMs: number;
  hitsCount: number;
}

export interface ClickEvent {
  type: "click";
  timestamp: string;
  index: string;
  query: string;
  documentId: string;
  rank: number;
}

export type AnalyticsEvent = QueryEvent | ClickEvent;

export class AnalyticsStorage {
  private buffer: AnalyticsEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private dataDir: string;

  constructor(baseDataDir = process.env.ANVESH_DATA_DIR || "/data/engine") {
    this.dataDir = join(baseDataDir, "..", "analytics");
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => console.error("[Analytics] Flush error:", err.message));
    }, 5000);
    this.flushTimer.unref?.();
  }

  logQuery(index: string, query: string, mode: string, tookMs: number, hitsCount: number): void {
    this.buffer.push({
      type: "query",
      timestamp: new Date().toISOString(),
      index,
      query,
      mode,
      tookMs,
      hitsCount,
    });
    if (this.buffer.length >= 100) {
      this.flush().catch((err) => console.error("[Analytics] Flush error:", err.message));
    }
  }

  logClick(index: string, query: string, documentId: string, rank: number): void {
    this.buffer.push({
      type: "click",
      timestamp: new Date().toISOString(),
      index,
      query,
      documentId,
      rank,
    });
    if (this.buffer.length >= 100) {
      this.flush().catch((err) => console.error("[Analytics] Flush error:", err.message));
    }
  }

  async flush(): Promise<void> {
    if (!this.buffer.length) return;
    const batch = [...this.buffer];
    this.buffer = [];

    const dateStr = new Date().toISOString().slice(0, 10);
    const filePath = join(this.dataDir, `${dateStr}.jsonl`);

    try {
      await mkdir(this.dataDir, { recursive: true });
      const payload = batch.map((e) => JSON.stringify(e)).join("\n") + "\n";
      await appendFile(filePath, payload, "utf8");
    } catch (err: any) {
      // Re-queue on failure
      this.buffer.unshift(...batch);
      throw err;
    }
  }

  async getSummary(indexName?: string, days = 7): Promise<{
    totalQueries: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    zeroResultQueries: number;
    totalClicks: number;
    topQueries: Array<{ query: string; count: number }>;
    recentZeroResults: Array<{ query: string; timestamp: string }>;
  }> {
    await this.flush();

    let files: string[] = [];
    try {
      files = await readdir(this.dataDir);
    } catch (_) {
      return {
        totalQueries: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        zeroResultQueries: 0,
        totalClicks: 0,
        topQueries: [],
        recentZeroResults: [],
      };
    }

    const jsonlFiles = files
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .slice(-days);

    let totalQueries = 0;
    let totalClicks = 0;
    let zeroResultQueries = 0;
    const latencies: number[] = [];
    const queryCounts = new Map<string, number>();
    const zeroResultsList: Array<{ query: string; timestamp: string }> = [];

    for (const file of jsonlFiles) {
      try {
        const content = await readFile(join(this.dataDir, file), "utf8");
        const lines = content.split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const ev: AnalyticsEvent = JSON.parse(line);
            if (indexName && ev.index !== indexName) continue;

            if (ev.type === "query") {
              totalQueries++;
              latencies.push(ev.tookMs);
              if (ev.query) {
                const qKey = ev.query.toLowerCase().trim();
                queryCounts.set(qKey, (queryCounts.get(qKey) ?? 0) + 1);
              }
              if (ev.hitsCount === 0) {
                zeroResultQueries++;
                if (zeroResultsList.length < 20) {
                  zeroResultsList.push({ query: ev.query, timestamp: ev.timestamp });
                }
              }
            } else if (ev.type === "click") {
              totalClicks++;
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

    latencies.sort((a, b) => a - b);
    const avgLatencyMs = latencies.length
      ? Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 100) / 100
      : 0;
    const p95LatencyMs = latencies.length
      ? Math.round((latencies[Math.floor(latencies.length * 0.95)] ?? 0) * 100) / 100
      : 0;

    const topQueries = [...queryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query, count]) => ({ query, count }));

    return {
      totalQueries,
      avgLatencyMs,
      p95LatencyMs,
      zeroResultQueries,
      totalClicks,
      topQueries,
      recentZeroResults: zeroResultsList.slice(0, 10),
    };
  }
}

export const globalAnalytics = new AnalyticsStorage();
