import type { TokenManager } from "./auth.js";
import type { AnveshConfigSpec, ConfigApplyResult, ConfigPlanResult } from "./types.js";

export class ConfigClient {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenManager: TokenManager
  ) {}

  async export(): Promise<AnveshConfigSpec> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/config/export`, { headers });
    if (!res.ok) throw new Error(`Failed to export config: ${await res.text()}`);
    const data = (await res.json()) as { ok: boolean; config: AnveshConfigSpec };
    return data.config;
  }

  async plan(config: AnveshConfigSpec, options?: { prune?: boolean }): Promise<ConfigPlanResult> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/config/plan`, {
      method: "POST",
      headers,
      body: JSON.stringify({ config, prune: options?.prune }),
    });
    if (!res.ok) throw new Error(`Config plan failed: ${await res.text()}`);
    const data = (await res.json()) as { ok: boolean; plan: ConfigPlanResult };
    return data.plan;
  }

  async apply(config: AnveshConfigSpec, options?: { prune?: boolean }): Promise<ConfigApplyResult> {
    const headers = await this.tokenManager.getAuthHeaders();
    const res = await fetch(`${this.baseUrl}/v1/config/apply`, {
      method: "POST",
      headers,
      body: JSON.stringify({ config, prune: options?.prune }),
    });
    if (!res.ok && res.status !== 207) {
      throw new Error(`Config apply failed: ${await res.text()}`);
    }
    return (await res.json()) as ConfigApplyResult;
  }
}
