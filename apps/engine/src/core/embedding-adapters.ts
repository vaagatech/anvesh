/**
 * Pluggable Embedding Adapters for Anvesh Search Engine.
 * 
 * Supports:
 *  - "local" (Default): Pure-CPU mathematical dense projections with zero external network or LLM dependencies.
 *  - "openai": OpenAI Embeddings API (e.g. text-embedding-3-small, text-embedding-3-large).
 *  - "gemini": Google Gemini Embeddings API (text-embedding-004).
 *  - "ollama": Self-hosted Ollama embedding models (nomic-embed-text, bge-m3, all-minilm).
 *  - "custom": Custom HTTP embedding endpoint or Hugging Face TEI.
 */
import { localEmbed } from "./embed.js";

export type EmbeddingProviderType = "local" | "openai" | "gemini" | "ollama" | "custom";

export interface EmbeddingConfig {
  provider?: EmbeddingProviderType;
  model?: string;
  apiKey?: string;
  endpoint?: string;
  dimensions?: number;
  timeoutMs?: number;
}

export interface EmbeddingAdapter {
  readonly provider: EmbeddingProviderType;
  readonly defaultDimensions: number;
  embed(text: string, dimensions?: number): Promise<number[]>;
  embedBatch(texts: string[], dimensions?: number): Promise<number[][]>;
  embedSync?(text: string, dimensions?: number): number[];
}

/**
 * Default Local Pure-CPU Embedding Adapter.
 * Zero external calls, zero API keys, sub-millisecond execution.
 */
export class LocalEmbeddingAdapter implements EmbeddingAdapter {
  readonly provider: EmbeddingProviderType = "local";
  readonly defaultDimensions: number = 512;

  embedSync(text: string, dimensions?: number): number[] {
    return localEmbed(text, dimensions || this.defaultDimensions);
  }

  async embed(text: string, dimensions?: number): Promise<number[]> {
    return this.embedSync(text, dimensions);
  }

  async embedBatch(texts: string[], dimensions?: number): Promise<number[][]> {
    const dims = dimensions || this.defaultDimensions;
    return texts.map((t) => this.embedSync(t, dims));
  }
}

/**
 * OpenAI Embeddings Adapter (e.g. text-embedding-3-small)
 */
export class OpenAIEmbeddingAdapter implements EmbeddingAdapter {
  readonly provider: EmbeddingProviderType = "openai";
  readonly defaultDimensions: number;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(config: EmbeddingConfig) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = config.model || process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
    this.endpoint = (config.endpoint || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    this.defaultDimensions = config.dimensions || (this.model.includes("3-large") ? 3072 : 1536);
    this.timeoutMs = config.timeoutMs || 5000;
  }

  async embed(text: string, dimensions?: number): Promise<number[]> {
    const [vec] = await this.embedBatch([text], dimensions);
    return vec || new Array(dimensions || this.defaultDimensions).fill(0);
  }

  async embedBatch(texts: string[], dimensions?: number): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error("OpenAI Embedding Adapter requires an API key (OPENAI_API_KEY).");
    }
    const dims = dimensions || this.defaultDimensions;
    const body: Record<string, any> = {
      model: this.model,
      input: texts,
    };
    if (this.model.startsWith("text-embedding-3")) {
      body.dimensions = dims;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.endpoint}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`OpenAI Embeddings API failed [${res.status}]: ${await res.text()}`);
      }

      const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
      return data.data.map((d) => d.embedding);
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Google Gemini Embeddings Adapter (text-embedding-004)
 */
export class GeminiEmbeddingAdapter implements EmbeddingAdapter {
  readonly provider: EmbeddingProviderType = "gemini";
  readonly defaultDimensions: number = 768;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(config: EmbeddingConfig) {
    this.apiKey = config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    this.model = config.model || "text-embedding-004";
    this.endpoint = (config.endpoint || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs || 5000;
  }

  async embed(text: string, dimensions?: number): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error("Gemini Embedding Adapter requires an API key (GEMINI_API_KEY).");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = `${this.endpoint}/models/${this.model}:embedContent?key=${this.apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text }] },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Gemini Embeddings API failed [${res.status}]: ${await res.text()}`);
      }

      const data = (await res.json()) as { embedding?: { values: number[] } };
      const values = data.embedding?.values || [];
      if (dimensions && values.length !== dimensions) {
        return localEmbed(text, dimensions);
      }
      return values;
    } finally {
      clearTimeout(timeout);
    }
  }

  async embedBatch(texts: string[], dimensions?: number): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t, dimensions)));
  }
}

/**
 * Ollama Local Embeddings Adapter (e.g. nomic-embed-text)
 */
export class OllamaEmbeddingAdapter implements EmbeddingAdapter {
  readonly provider: EmbeddingProviderType = "ollama";
  readonly defaultDimensions: number = 768;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(config: EmbeddingConfig) {
    this.model = config.model || process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
    this.endpoint = (config.endpoint || process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/$/, "");
    this.defaultDimensions = config.dimensions || 768;
    this.timeoutMs = config.timeoutMs || 5000;
  }

  async embed(text: string, dimensions?: number): Promise<number[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.endpoint}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Ollama Embeddings API failed [${res.status}]: ${await res.text()}`);
      }

      const data = (await res.json()) as { embedding: number[] };
      return data.embedding;
    } finally {
      clearTimeout(timeout);
    }
  }

  async embedBatch(texts: string[], dimensions?: number): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t, dimensions)));
  }
}

/**
 * Custom HTTP Embedding Adapter (Hugging Face TEI / custom microservice)
 */
export class CustomHttpEmbeddingAdapter implements EmbeddingAdapter {
  readonly provider: EmbeddingProviderType = "custom";
  readonly defaultDimensions: number;
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(config: EmbeddingConfig) {
    if (!config.endpoint) {
      throw new Error("Custom HTTP Embedding Adapter requires an endpoint URL.");
    }
    this.endpoint = config.endpoint.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.defaultDimensions = config.dimensions || 512;
    this.timeoutMs = config.timeoutMs || 5000;
  }

  async embed(text: string, dimensions?: number): Promise<number[]> {
    const [vec] = await this.embedBatch([text], dimensions);
    return vec || new Array(dimensions || this.defaultDimensions).fill(0);
  }

  async embedBatch(texts: string[], dimensions?: number): Promise<number[][]> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ texts, dimensions: dimensions || this.defaultDimensions }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Custom Embedding API failed [${res.status}]: ${await res.text()}`);
      }

      const data = (await res.json()) as { embeddings?: number[][]; vectors?: number[][] } | number[][];
      if (Array.isArray(data)) return data;
      return data.embeddings || data.vectors || [];
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Factory function to create an embedding adapter based on configuration.
 * By default returns the zero-overhead LocalEmbeddingAdapter.
 */
export function createEmbeddingAdapter(config?: EmbeddingConfig): EmbeddingAdapter {
  const provider = config?.provider || (process.env.ANVESH_EMBEDDING_PROVIDER as EmbeddingProviderType) || "local";

  switch (provider) {
    case "openai":
      return new OpenAIEmbeddingAdapter(config || {});
    case "gemini":
      return new GeminiEmbeddingAdapter(config || {});
    case "ollama":
      return new OllamaEmbeddingAdapter(config || {});
    case "custom":
      return new CustomHttpEmbeddingAdapter(config || { endpoint: "" });
    case "local":
    default:
      return new LocalEmbeddingAdapter();
  }
}
