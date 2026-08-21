import v8 from "node:v8";

/**
 * Lightweight circuit breakers — protect the in-process engine from runaway load.
 */
export class CircuitBreakers {
  readonly tripped: Record<string, number> = {
    body: 0,
    bulk: 0,
    concurrent: 0,
    resultWindow: 0,
    memory: 0,
    fuzzy: 0,
    docs: 0,
  };

  private inFlightSearch = 0;

  constructor(
    private readonly limits = {
      maxBodyBytes: Number(process.env.ANVESH_MAX_BODY_BYTES ?? 5 * 1024 * 1024),
      maxBulkDocs: Number(process.env.ANVESH_MAX_BULK_DOCS ?? 1000),
      maxConcurrentSearch: Number(process.env.ANVESH_MAX_CONCURRENT_SEARCH ?? 32),
      maxResultWindow: Number(process.env.ANVESH_MAX_RESULT_WINDOW ?? 10_000),
      maxRssMb: Number(process.env.ANVESH_MAX_RSS_MB ?? 0), // 0 = disabled
      maxDocsPerIndex: Number(process.env.ANVESH_MAX_DOCS_PER_INDEX ?? 0),
      maxFuzzyCandidates: Number(process.env.ANVESH_MAX_FUZZY_CANDIDATES ?? 50),
    },
  ) {}

  get config() {
    return { ...this.limits };
  }

  getLimits() {
    return { ...this.limits };
  }

  setLimits(newLimits: Partial<typeof this.limits>) {
    Object.assign(this.limits, newLimits);
  }

  checkBulkSize(count: number): void {
    if (count > this.limits.maxBulkDocs) {
      this.tripped.bulk! += 1;
      const err = new Error(
        `Bulk batch too large (${count} > ${this.limits.maxBulkDocs}). Split the request.`,
      );
      (err as Error & { code: string; httpStatus: number }).code = "ERR_CIRCUIT_BULK";
      (err as Error & { httpStatus: number }).httpStatus = 400;
      throw err;
    }
  }

  checkResultWindow(from: number, size: number): void {
    if (from + size > this.limits.maxResultWindow) {
      this.tripped.resultWindow! += 1;
      const err = new Error(
        `Result window too large (from+size=${from + size} > ${this.limits.maxResultWindow}). Use search_after or a smaller page.`,
      );
      (err as Error & { code: string; httpStatus: number }).code = "ERR_CIRCUIT_RESULT_WINDOW";
      (err as Error & { httpStatus: number }).httpStatus = 400;
      throw err;
    }
  }

  checkDocCap(currentDocs: number, adding: number): void {
    if (!this.limits.maxDocsPerIndex) return;
    if (currentDocs + adding > this.limits.maxDocsPerIndex) {
      this.tripped.docs! += 1;
      const err = new Error(
        `Index would exceed doc cap (${this.limits.maxDocsPerIndex}).`,
      );
      (err as Error & { code: string; httpStatus: number }).code = "ERR_CIRCUIT_DOCS";
      (err as Error & { httpStatus: number }).httpStatus = 429;
      throw err;
    }
  }

  checkMemory(): void {
    const mem = process.memoryUsage();
    const heapUsedMb = mem.heapUsed / (1024 * 1024);
    const heapLimitMb = v8.getHeapStatistics().heap_size_limit / (1024 * 1024);
    const rssMb = mem.rss / (1024 * 1024);

    // 1. Check Heap Utilization Guard (75% warning / 85% backpressure)
    const heapRatio = heapUsedMb / heapLimitMb;
    if (heapRatio > 0.85) {
      if (typeof (global as any).gc === "function") {
        try { (global as any).gc(); } catch (_) {}
      }
      this.tripped.memory! += 1;
      const err = new Error(
        `Resource guard active: Heap utilization at ${Math.round(heapRatio * 100)}% (> 85%). Applying backpressure.`
      );
      (err as Error & { code: string; httpStatus: number }).code = "ERR_CIRCUIT_MEMORY";
      (err as Error & { httpStatus: number }).httpStatus = 429;
      throw err;
    } else if (heapRatio > 0.75) {
      if (typeof (global as any).gc === "function") {
        try { (global as any).gc(); } catch (_) {}
      }
    }

    // 2. Check Absolute RSS limit if configured
    if (this.limits.maxRssMb && rssMb > this.limits.maxRssMb) {
      this.tripped.memory! += 1;
      const err = new Error(
        `Memory circuit open (RSS ${Math.round(rssMb)}MB > ${this.limits.maxRssMb}MB). Retry later.`
      );
      (err as Error & { code: string; httpStatus: number }).code = "ERR_CIRCUIT_MEMORY";
      (err as Error & { httpStatus: number }).httpStatus = 429;
      throw err;
    }
  }

  async withSearchSlot<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.inFlightSearch >= this.limits.maxConcurrentSearch) {
      this.tripped.concurrent! += 1;
      const err = new Error(
        `Too many concurrent searches (max ${this.limits.maxConcurrentSearch}).`,
      );
      (err as Error & { code: string; httpStatus: number }).code = "ERR_CIRCUIT_CONCURRENT";
      (err as Error & { httpStatus: number }).httpStatus = 429;
      throw err;
    }
    this.checkMemory();
    this.inFlightSearch += 1;
    try {
      return await fn();
    } finally {
      this.inFlightSearch -= 1;
    }
  }

  capFuzzy(candidates: number): number {
    if (candidates > this.limits.maxFuzzyCandidates) {
      this.tripped.fuzzy! += 1;
      return this.limits.maxFuzzyCandidates;
    }
    return candidates;
  }

  stats() {
    return {
      inFlightSearch: this.inFlightSearch,
      limits: this.config,
      tripped: { ...this.tripped },
      rssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    };
  }
}

export const globalCircuits = new CircuitBreakers();
