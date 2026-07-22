export interface HttpClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export class HttpClient {
  readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    return headers;
  }

  async request(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
    const headers = this.headers(extraHeaders);
    let payload: string | undefined;
    if (body !== undefined) {
      if (typeof body === "string") {
        payload = body;
      } else {
        if (!headers["content-type"]) headers["content-type"] = "application/json";
        payload = JSON.stringify(body);
      }
    }
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: payload,
    });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { message: text };
      }
    }
    return { ok: res.ok, status: res.status, json, text };
  }

  async get(path: string, extraHeaders?: Record<string, string>) {
    return this.request("GET", path, undefined, extraHeaders);
  }

  async post(path: string, body?: unknown, extraHeaders?: Record<string, string>) {
    return this.request("POST", path, body, extraHeaders);
  }

  async put(path: string, body?: unknown, extraHeaders?: Record<string, string>) {
    return this.request("PUT", path, body, extraHeaders);
  }

  async delete(path: string, extraHeaders?: Record<string, string>) {
    return this.request("DELETE", path, undefined, extraHeaders);
  }
}
