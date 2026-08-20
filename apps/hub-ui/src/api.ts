import { extractUserClaims, isCognitoConfigured, parseJwt } from "./cognito";
const TOKEN_KEY = "anvesh.hub.token";
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://fgqza9ykw7.execute-api.us-east-1.amazonaws.com/anvesh").replace(/\/$/, "");

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function hub<T = Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  const token = getToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  const url = API_BASE ? `${API_BASE}${path.startsWith("/" ) ? path : `/${path}`}` : path;
  const res = await fetch(url, { ...init, headers });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string; ok?: boolean };
  if (!res.ok) {
    throw new Error(json.message || `Request failed (${res.status})`);
  }
  return json;
}

export const api = {
  health: () => hub<{ users: number; instances: number; message: string }>("/hub/health"),
  login: (username: string, password: string) =>
    hub<{ token: string; user: HubUser; message: string }>("/hub/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => hub("/hub/auth/logout", { method: "POST" }),
  me: async (): Promise<{ user: HubUser }> => {
    const token = getToken();
    const idToken = localStorage.getItem("anvesh.hub.id_token") || token;
    if (token && token.split(".").length === 3) {
      const claims = extractUserClaims(idToken || token, token);
      return {
        user: {
          id: claims.sub || claims.username,
          username: claims.username,
          role: claims.role,
          createdAt: new Date().toISOString(),
        }
      };
    }
    return hub<{ user: HubUser }>("/hub/auth/me");
  },
  changePassword: (currentPassword: string, newPassword: string) =>
    hub<{ message: string }>("/hub/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  listUsers: (from = 0, size = 20) =>
    hub<{ users: HubUser[]; total: number; from: number; size: number }>(
      `/hub/users?from=${from}&size=${size}`,
    ),
  createUser: (payload: { username: string; password: string; role: string }) =>
    hub("/hub/users", { method: "POST", body: JSON.stringify(payload) }),
  deleteUser: (id: string) => hub(`/hub/users/${id}`, { method: "DELETE" }),

  listInstances: () => hub<{ instances: HubInstance[]; message?: string }>("/hub/instances"),
  createInstance: (payload: unknown) =>
    hub("/hub/instances", { method: "POST", body: JSON.stringify(payload) }),
  updateInstance: (id: string, payload: unknown) =>
    hub(`/hub/instances/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteInstance: (id: string) => hub(`/hub/instances/${id}`, { method: "DELETE" }),
  healthInstance: (id: string) => hub(`/hub/instances/${id}/health`, { method: "POST" }),

  listIndexes: (engineId: string) =>
    hub<{ indexes: IndexInfo[] }>(`/hub/engines/${engineId}/indexes`),
  getIndex: (engineId: string, name: string) =>
    hub<{ index: IndexDetail }>(`/hub/engines/${engineId}/indexes/${encodeURIComponent(name)}`),
  createIndex: (engineId: string, payload: unknown) =>
    hub<{ ok: boolean; message: string }>(`/hub/engines/${engineId}/indexes`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  
  listSnapshots: (engineId: string, name: string) =>
    hub<{ snapshots: IndexSnapshot[]; message?: string }>(
      `/hub/engines/${engineId}/indexes/${encodeURIComponent(name)}/snapshots`,
    ),
  createSnapshot: (engineId: string, name: string, note?: string) =>
    hub<{ snapshot: IndexSnapshot; message: string }>(
      `/hub/engines/${engineId}/indexes/${encodeURIComponent(name)}/snapshots`,
      { method: "POST", body: JSON.stringify({ note }) },
    ),
  revertSnapshot: (engineId: string, name: string, snapshotId: string) =>
    hub<{ message: string }>(
      `/hub/engines/${engineId}/indexes/${encodeURIComponent(name)}/snapshots/${encodeURIComponent(snapshotId)}/revert`,
      { method: "POST" },
    ),

  deleteIndex: (engineId: string, name: string) =>
    hub(`/hub/engines/${engineId}/indexes/${encodeURIComponent(name)}`, { method: "DELETE" }),
  search: (engineId: string, name: string, payload: unknown) =>
    hub<{ hits: SearchHit[]; total: number; message?: string; tookMs?: number }>(
      `/hub/engines/${engineId}/indexes/${encodeURIComponent(name)}/search`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
  validateDocs: (engineId: string, name: string, documents: unknown[]) =>
    hub<{ ok: boolean; issues: { path: string; message: string }[] }>(
      `/hub/engines/${engineId}/indexes/${encodeURIComponent(name)}/validate`,
      { method: "POST", body: JSON.stringify({ documents }) },
    ),
  ingestDocs: (engineId: string, name: string, documents: unknown[], validate = true) =>
    hub(`/hub/engines/${engineId}/indexes/${encodeURIComponent(name)}/ingest`, {
      method: "POST",
      body: JSON.stringify({ documents, validate }),
    }),
  listDocuments: (engineId: string, name: string, from = 0, size = 20) =>
    hub<{ total: number; documents: IndexedDocument[]; message?: string }>(
      `/hub/engines/${engineId}/indexes/${encodeURIComponent(name)}/documents?from=${from}&size=${size}`,
    ),
  deleteDocument: (engineId: string, name: string, id: string) =>
    hub(`/hub/engines/${engineId}/indexes/${encodeURIComponent(name)}/documents/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  clearDocuments: (engineId: string, name: string) =>
    hub<{ deleted: number; message?: string }>(
      `/hub/engines/${engineId}/indexes/${encodeURIComponent(name)}/documents`,
      { method: "DELETE" },
    ),

  listSpiderConfigs: () => hub<{ configs: SpiderConfigRow[] }>("/hub/spider-configs"),
  saveSpiderConfig: (payload: unknown) =>
    hub("/hub/spider-configs", { method: "POST", body: JSON.stringify(payload) }),
  updateSpiderConfig: (id: string, payload: unknown) =>
    hub(`/hub/spider-configs/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteSpiderConfig: (id: string) => hub(`/hub/spider-configs/${id}`, { method: "DELETE" }),
  runSpider: (id: string, payload?: { indexName?: string }) =>
    hub(`/hub/spider-configs/${id}/run`, {
      method: "POST",
      body: payload ? JSON.stringify(payload) : undefined,
    }),

  listIndexerConfigs: () => hub<{ configs: IndexerConfigRow[] }>("/hub/indexer-configs"),
  saveIndexerConfig: (payload: unknown) =>
    hub("/hub/indexer-configs", { method: "POST", body: JSON.stringify(payload) }),
  updateIndexerConfig: (id: string, payload: unknown) =>
    hub(`/hub/indexer-configs/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteIndexerConfig: (id: string) => hub(`/hub/indexer-configs/${id}`, { method: "DELETE" }),
  runIndexer: (id: string) => hub(`/hub/indexer-configs/${id}/run`, { method: "POST" }),

  listJobs: (from = 0, size = 20, status?: string) => {
    const qs = new URLSearchParams({ from: String(from), size: String(size) });
    if (status) qs.set("status", status);
    return hub<{ jobs: HubJob[]; total: number; from: number; size: number }>(
      `/hub/jobs?${qs}`,
    );
  },
  refreshJob: (id: string) => hub(`/hub/jobs/${id}/refresh`, { method: "POST" }),
  cancelJob: (id: string) =>
    hub<{ message: string; job?: HubJob }>(`/hub/jobs/${id}/cancel`, { method: "POST" }),
  deleteJob: (id: string) => hub(`/hub/jobs/${id}`, { method: "DELETE" }),
  clearFinishedJobs: () =>
    hub<{ cleared: number; message: string }>("/hub/jobs/clear-finished", { method: "POST" }),
  fleetHealth: () =>
    hub<{
      online: number;
      total: number;
      message: string;
      results: FleetHealthRow[];
    }>("/hub/fleet/health", { method: "POST" }),
  listAudit: (from = 0, size = 20) =>
    hub<{ entries: AuditEntry[]; total: number; from: number; size: number }>(
      `/hub/audit?from=${from}&size=${size}`,
    ),
  listDeadLetter: (source?: string, index?: string, limit = 50) => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (source) qs.set("source", source);
    if (index) qs.set("index", index);
    return hub<{ ok: boolean; total: number; count: number; entries: DeadLetterEntry[] }>(
      `/hub/dead-letter?${qs}`,
    );
  },
  replayDeadLetter: (instanceId: string, indexName: string, ids?: string[]) =>
    hub<{ ok: boolean; replayed: number; failed: number; message: string }>(
      "/hub/dead-letter/replay",
      {
        method: "POST",
        body: JSON.stringify({ instanceId, indexName, ids }),
      },
    ),
};

export interface HubUser {
  id: string;
  username: string;
  role: "admin" | "operator" | "viewer";
  createdAt: string;
}

export type HubInstanceKind =
  | "engine"
  | "indexer"
  | "spider"
  | "elasticsearch"
  | "opensearch"
  | "solr";

export const HUB_SEARCH_INSTANCE_KINDS: HubInstanceKind[] = [
  "engine",
  "elasticsearch",
  "opensearch",
  "solr",
];

export interface HubInstance {
  id: string;
  name: string;
  kind: HubInstanceKind;
  baseUrl: string;
  enabled: boolean;
  hasApiKey?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface IndexInfo {
  name: string;
  docCount?: number;
  mappings?: Record<string, { type: string }>;
  settings?: Record<string, unknown>;
}

export interface IndexDetail {
  name: string;
  mappings: Record<string, { type: string }>;
  settings?: Record<string, unknown>;
  docCount?: number;
}

export interface IndexedDocument {
  id: string;
  fields: Record<string, unknown>;
  meta?: Record<string, unknown>;
  updatedAt?: string;
}


export interface IndexSnapshot {
  id: string;
  indexName: string;
  docCount: number;
  checksum: string;
  createdAt: string;
  note?: string;
  sizeBytes?: number;
}

export interface SearchHit {
  id: string;
  score: number;
  source: { fields: Record<string, unknown> };
  highlight?: Record<string, string[]>;
  distanceKm?: number;
}

export interface SpiderConfigRow {
  id: string;
  name: string;
  description?: string;
  instanceId?: string;
  indexName?: string;
  autoIndex?: boolean;
  indexerInstanceId?: string;
  engineInstanceId?: string;
  config: Record<string, unknown>;
  updatedAt: string;
}

export interface IndexerConfigRow {
  id: string;
  name: string;
  description?: string;
  instanceId?: string;
  engineInstanceId?: string;
  indexName: string;
  inputPath?: string;
  batchSize?: number;
  updatedAt: string;
}

export interface HubJob {
  id: string;
  kind: "spider" | "indexer";
  status: string;
  message: string;
  configId?: string;
  configName?: string;
  instanceId?: string;
  remoteJobId?: string;
  output?: string;
  logs?: string[];
  indexName?: string;
  pagesIndexed?: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface FleetHealthRow {
  id: string;
  name: string;
  kind: HubInstanceKind;
  baseUrl?: string;
  enabled: boolean;
  ok: boolean;
  status: number;
  latencyMs: number;
  message: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorName?: string;
  action: string;
  target?: string;
  detail?: string;
  ok: boolean;
}

export interface DeadLetterEntry {
  id: string;
  recordId?: string;
  source: "engine" | "spider" | "indexer" | "hub";
  targetIndex?: string;
  error: string;
  timestamp: string;
  retryCount: number;
  payload: unknown;
}
