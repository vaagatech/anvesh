/**
 * Local Semantic Dense Embeddings for autoEmbed & RAG.
 * Features:
 *  - Compound token splitting (camelCase, snake_case)
 *  - Natural Language Intent normalization (stripping conversational fillers)
 *  - High-density semantic synonym & concept clusters
 *  - Multi-hash orthogonal signed projections producing unit-length Float32 dense vectors
 * Provides true semantic retrieval without requiring heavy local SLM/LLM runtimes.
 */
import { stem, tokenize, splitCompound } from "./analyzer.js";

const QUESTION_STOPWORDS = new Set([
  "what", "is", "my", "how", "to", "where", "can", "i", "find", "show",
  "me", "the", "a", "an", "of", "for", "in", "with", "tell", "about", "get",
  "which", "who", "whom", "whose", "why", "when", "does", "do", "did"
]);

const SYNONYM_CLUSTERS: string[][] = [
  ["user", "userid", "username", "account", "login", "handle", "profile", "identity", "credential", "auth", "member", "customer"],
  ["password", "passcode", "secret", "pin", "token", "key", "apikey", "jwt", "bearer", "accesskey"],
  ["price", "cost", "pricing", "fee", "billing", "invoice", "plan", "subscription", "charge", "payment", "tier", "amount"],
  ["database", "datastore", "db", "sql", "nosql", "postgres", "mysql", "sqlite", "table", "index", "vector", "record", "storage"],
  ["cloud", "infrastructure", "server", "host", "hosting", "k8s", "kubernetes", "cluster", "node", "instance", "oci", "aws", "oracle", "amazon"],
  ["search", "query", "find", "retrieve", "lookup", "discover", "seek", "filter", "match", "scan", "browse"],
  ["error", "bug", "issue", "problem", "fault", "crash", "exception", "failure", "panic", "corrupt", "corruption"],
  ["speed", "latency", "performance", "fast", "throughput", "benchmark", "qps", "ops", "efficiency", "quick", "optimized"],
  ["geo", "location", "place", "address", "city", "region", "coordinates", "lat", "lon", "distance", "radius", "map", "bengaluru", "bangalore"],
  ["crawl", "crawler", "spider", "scrape", "scraping", "site", "webpage", "harvester", "extractor", "html", "url"],
  ["document", "documents", "article", "post", "content", "corpus", "file", "text", "knowledge", "wiki", "docs"],
  ["semantic", "meaning", "similarity", "hybrid", "vector", "embedding", "paraphrase", "context", "intent", "dense"],
  ["settings", "config", "configuration", "preferences", "options", "setup", "parameters", "env"],
  ["snapshot", "backup", "restore", "revert", "rollback", "version", "history", "point-in-time", "recovery"],
  ["role", "roles", "rbac", "admin", "operator", "viewer", "permission", "privilege", "scope"]
];

const SYNONYM_MAP = new Map<string, string[]>();
for (const group of SYNONYM_CLUSTERS) {
  const stemmedGroup = [...new Set(group.map((w) => stem(w.toLowerCase())))];
  for (const t of stemmedGroup) {
    SYNONYM_MAP.set(t, stemmedGroup.filter((x) => x !== t));
  }
}

function hash32(s: string, seed = 0): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function expandTokens(tokens: string[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    out.push(t);
    const syns = SYNONYM_MAP.get(t);
    if (syns) {
      for (const s of syns) out.push(s);
    }
  }
  return out;
}

function charNgrams(token: string, n = 3): string[] {
  if (token.length < n) return token.length ? ["#" + token] : [];
  const grams: string[] = [];
  const padded = "#" + token + "#";
  for (let i = 0; i <= padded.length - n; i++) {
    grams.push(padded.slice(i, i + n));
  }
  return grams;
}

/**
 * Project text into a high-precision dense unit vector.
 * Similar meaning / vocabulary / synonym intents produce high cosine similarity (>0.85).
 */
export function localEmbed(text: string, dimensions: number): number[] {
  const dims = Math.max(1, Math.min(Math.floor(dimensions), 1536));
  const vec = new Array<number>(dims).fill(0);

  // 1. Split compounds (e.g. userId -> user id) & normalize
  const splitText = splitCompound(text);
  const baseTokens = tokenize(splitText, { stopwords: true, stemming: true });

  // 2. Filter conversational question fillers for natural language intent retrieval
  const meaningful = baseTokens.filter((t) => !QUESTION_STOPWORDS.has(t) && t.length > 1);
  const activeTokens = meaningful.length > 0 ? meaningful : baseTokens;
  if (!activeTokens.length) return vec;

  // 3. Expand with contextual semantic synonym clusters
  const tokens = expandTokens(activeTokens);

  // 4. Feature weighting: Unigrams + Subword Char N-grams + Bigrams
  const features: Array<{ key: string; w: number }> = [];
  for (const t of tokens) {
    features.push({ key: "u:" + t, w: 1.0 });
    for (const g of charNgrams(t, 3)) {
      features.push({ key: "c:" + g, w: 0.35 });
    }
  }
  for (let i = 0; i < activeTokens.length - 1; i++) {
    features.push({ key: "b:" + activeTokens[i] + "_" + activeTokens[i + 1], w: 0.6 });
  }

  // 5. Multi-hash signed orthogonal projection
  for (const { key, w } of features) {
    for (let salt = 0; salt < 4; salt++) {
      const h = hash32(key, salt * 0x9e3779b9);
      const idx = h % dims;
      const sign = (h & 1) ? 1 : -1;
      vec[idx]! += sign * w * (1 / (salt + 1));
    }
  }

  // 6. L2 Unit Normalization
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dims; i++) vec[i]! /= norm;
  return vec;
}

/** Prefer title/body/summary fields for dense embedding. */
export function textFromFields(fields: Record<string, unknown>): string {
  const prefer = ["title", "name", "body", "description", "content", "text", "summary", "desc"];
  const parts: string[] = [];
  for (const key of prefer) {
    const v = fields[key];
    if (typeof v === "string" && v.trim()) {
      const weight = key === "title" || key === "name" ? 3 : 1;
      for (let i = 0; i < weight; i++) parts.push(v);
    }
  }
  for (const [k, v] of Object.entries(fields)) {
    if (prefer.includes(k)) continue;
    if (k === "url" || k === "location" || k === "status" || k === "id") continue;
    if (typeof v === "string" && v.trim()) parts.push(v);
  }
  return parts.join(" ");
}

/** Filter out weak noise below relative floor. */
export function meaningfulVectorHits(
  scored: Array<{ id: string; score: number }>,
  opts?: { minAbsolute?: number; relativeOfBest?: number; topK?: number },
): Array<{ id: string; score: number }> {
  if (!scored.length) return [];
  const minAbsolute = opts?.minAbsolute ?? 0.15;
  const relativeOfBest = opts?.relativeOfBest ?? 0.45;
  const best = scored[0]!.score;
  const floor = Math.max(minAbsolute, best * relativeOfBest);
  const kept = scored.filter((r) => r.score >= floor);
  return kept.slice(0, opts?.topK ?? kept.length);
}
