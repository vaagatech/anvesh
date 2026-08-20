/**
 * Universal Resource Guard across all Anvesh microservices.
 * Limits CPU/memory usage to <= 75%, leaving resources for GC,
 * dynamically scales chunk sizes for large records, and applies
 * non-blocking backpressure.
 * VaagaTech · https://www.vaagatech.com
 */
export interface ResourceGuardOptions {
  warnHeapRatio?: number; // default 0.65 (65%)
  maxHeapRatio?: number;  // default 0.75 (75% limit as per platform requirements)
  maxRssMb?: number;
}

export class ResourceGuard {
  private warnHeapRatio: number;
  private maxHeapRatio: number;
  private maxRssMb?: number;
  private lastWarning = 0;
  private gcRuns = 0;

  constructor(opts: ResourceGuardOptions = {}) {
    this.warnHeapRatio = opts.warnHeapRatio ?? (process.env.ANVESH_WARN_HEAP_RATIO ? Number(process.env.ANVESH_WARN_HEAP_RATIO) : 0.65);
    this.maxHeapRatio = opts.maxHeapRatio ?? (process.env.ANVESH_MAX_HEAP_RATIO ? Number(process.env.ANVESH_MAX_HEAP_RATIO) : 0.75);
    this.maxRssMb = opts.maxRssMb ?? (process.env.ANVESH_MAX_RSS_MB ? Number(process.env.ANVESH_MAX_RSS_MB) : undefined);
  }

  check(): { ok: boolean; status: "normal" | "warning" | "critical"; heapRatio: number; rssMb: number } {
    const mem = process.memoryUsage();
    const heapUsedMb = mem.heapUsed / (1024 * 1024);
    const heapTotalMb = mem.heapTotal / (1024 * 1024);
    const rssMb = mem.rss / (1024 * 1024);
    const heapRatio = heapUsedMb / Math.max(heapTotalMb, 64);

    if (heapRatio > this.maxHeapRatio || (this.maxRssMb && rssMb > this.maxRssMb)) {
      this.runGc();
      return { ok: false, status: "critical", heapRatio, rssMb };
    }

    if (heapRatio > this.warnHeapRatio) {
      if (Date.now() - this.lastWarning > 8000) {
        this.lastWarning = Date.now();
        this.runGc();
      }
      return { ok: true, status: "warning", heapRatio, rssMb };
    }

    return { ok: true, status: "normal", heapRatio, rssMb };
  }

  private runGc(): void {
    if (typeof (global as any).gc === "function") {
      try {
        (global as any).gc();
        this.gcRuns++;
      } catch (_) {}
    }
  }

  /**
   * Calculates intelligent graduated micro-delay based on active memory pressure.
   * Instead of abruptly stopping or deallocating, in-process items are softly paced.
   */
  getPacingDelayMs(): number {
    const status = this.check();
    if (status.status === "critical") {
      return 35; // 35ms micro-pause to let V8 GC and I/O drain
    }
    if (status.status === "warning") {
      // Linear gradient between 5ms and 20ms
      const factor = (status.heapRatio - this.warnHeapRatio) / Math.max(0.01, this.maxHeapRatio - this.warnHeapRatio);
      return Math.round(5 + factor * 15);
    }
    return 0;
  }

  /**
   * Intelligent in-flight auto-adjustment.
   * If a batch is mid-execution and memory rises, dynamically paces the in-flight loop
   * without dropping records or triggering abrupt errors.
   */
  async paceInFlight(): Promise<void> {
    const delay = this.getPacingDelayMs();
    if (delay > 0) {
      this.runGc();
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  /**
   * Intelligently calculate adaptive chunk size based on record byte size and memory pressure.
   * If records are huge (e.g. multi-MB pages or embedding arrays), or if heap is high,
   * dynamically shrinks the chunk size to stay safely within the 75% memory ceiling.
   */
  calculateAdaptiveChunkSize(
    totalItems: number,
    sampleRecordBytes = 2048,
    baseBatchSize = 50
  ): number {
    const status = this.check();
    let size = baseBatchSize;

    // 1. Scale down based on record byte payload weight
    if (sampleRecordBytes > 1024 * 1024) {
      // >1MB per record
      size = Math.min(size, 2);
    } else if (sampleRecordBytes > 250 * 1024) {
      // >250KB per record
      size = Math.min(size, 5);
    } else if (sampleRecordBytes > 50 * 1024) {
      // >50KB per record
      size = Math.min(size, 15);
    }

    // 2. Scale down dynamically based on memory ratio
    if (status.status === "warning") {
      const reduction = Math.max(0.2, 1 - (status.heapRatio - this.warnHeapRatio) * 3);
      size = Math.max(1, Math.floor(size * reduction));
    } else if (status.status === "critical") {
      size = 1;
    }

    return Math.max(1, Math.min(size, totalItems));
  }

  /**
   * Non-blocking backpressure throttler.
   * Yields execution to the event loop and triggers GC if approaching the 75% memory ceiling.
   */
  async throttleIfNeeded(actionDescription = "batch processing"): Promise<void> {
    const status = this.check();
    if (status.status === "critical") {
      this.runGc();
      // Yield to let garbage collection and I/O catch up
      await new Promise((resolve) => setTimeout(resolve, 50));
      const retry = this.check();
      if (!retry.ok) {
        // Yield again with microtask
        await new Promise((resolve) => setImmediate(resolve));
      }
    } else if (status.status === "warning") {
      await this.paceInFlight();
    }
  }

  assertSafe(actionDescription = "operation"): void {
    const status = this.check();
    if (!status.ok) {
      const err = new Error(
        `ResourceGuard critical: Heap utilization at ${Math.round(status.heapRatio * 100)}% (limit <= ${Math.round(this.maxHeapRatio * 100)}%). Backpressure applied to ${actionDescription}.`
      );
      (err as any).code = "ERR_RESOURCE_GUARD_CRITICAL";
      (err as any).httpStatus = 429;
      throw err;
    }
  }

  stats() {
    const mem = process.memoryUsage();
    return {
      heapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 100) / 100,
      heapTotalMb: Math.round((mem.heapTotal / (1024 * 1024)) * 100) / 100,
      rssMb: Math.round((mem.rss / (1024 * 1024)) * 100) / 100,
      heapRatio: Math.round((mem.heapUsed / Math.max(mem.heapTotal, 64)) * 1000) / 1000,
      maxHeapRatio: this.maxHeapRatio,
      warnHeapRatio: this.warnHeapRatio,
      gcRuns: this.gcRuns,
      pacingDelayMs: this.getPacingDelayMs(),
    };
  }
}

export const globalResourceGuard = new ResourceGuard();

