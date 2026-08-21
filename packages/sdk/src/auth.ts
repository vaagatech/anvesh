/**
 * Anvesh Token Manager — handles API keys and automatic Cognito M2M OAuth2 token renewal.
 */

export class TokenManager {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly config: {
      apiKey?: string;
      m2m?: {
        clientId: string;
        clientSecret: string;
        tokenUrl: string;
        scope?: string;
      };
    }
  ) {}

  async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
      return headers;
    }

    if (this.config.m2m) {
      const { clientId, clientSecret, tokenUrl, scope } = this.config.m2m;
      const now = Date.now();

      if (this.cachedToken && this.tokenExpiresAt > now + 60_000) {
        headers["Authorization"] = `Bearer ${this.cachedToken}`;
        return headers;
      }

      const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const body = new URLSearchParams({
        grant_type: "client_credentials",
      });
      if (scope) {
        body.set("scope", scope);
      }

      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${creds}`,
        },
        body: body.toString(),
      });

      if (!res.ok) {
        throw new Error(`Cognito M2M token request failed (${res.status}): ${await res.text()}`);
      }

      const data = (await res.json()) as { access_token: string; expires_in?: number };
      this.cachedToken = data.access_token;
      const expiresIn = (data.expires_in ?? 3600) * 1000;
      this.tokenExpiresAt = now + expiresIn;
      headers["Authorization"] = `Bearer ${this.cachedToken}`;
    }

    return headers;
  }
}
