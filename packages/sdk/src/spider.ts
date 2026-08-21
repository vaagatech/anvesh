import type { TokenManager } from "./auth.js";
import type { SpiderCrawlRequest, SpiderJob } from "./types.js";

export class SpiderClient {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenManager: TokenManager
  ) {}

  async crawl(options: SpiderCrawlRequest): Promise<{ ok: boolean; jobId: string }> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/spider/crawl`, {
      method: "POST",
      headers,
      body: JSON.stringify(options),
    });
    if (!res.ok) throw new Error(`Failed to start crawl job: ${await res.text()}`);
    return (await res.json()) as { ok: boolean; jobId: string };
  }

  async listJobs(limit = 20): Promise<SpiderJob[]> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/spider/jobs?limit=${limit}`, { headers });
    if (!res.ok) throw new Error(`Failed to list crawl jobs: ${await res.text()}`);
    const data = (await res.json()) as { ok: boolean; jobs: SpiderJob[] };
    return data.jobs;
  }

  async getJob(id: string): Promise<SpiderJob> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/spider/jobs/${encodeURIComponent(id)}`, { headers });
    if (!res.ok) throw new Error(`Failed to get crawl job '${id}': ${await res.text()}`);
    const data = (await res.json()) as { ok: boolean; job: SpiderJob };
    return data.job;
  }

  async cancelJob(id: string): Promise<boolean> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/spider/jobs/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      headers,
    });
    if (!res.ok) throw new Error(`Failed to cancel crawl job '${id}': ${await res.text()}`);
    return true;
  }
}
