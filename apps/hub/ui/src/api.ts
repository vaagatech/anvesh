const TOKEN_KEY = "anvesh.hub.token";

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token: string | null): void {
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

async function hub<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  const token = getToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers });
  const body = (await res.json().catch(() => ({}))) as T & { message?: string; ok?: boolean };
  if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`);
  return body;
}

export const api = {
  health: () => hub<{ message: string; users: number; instances: number }>("/hub/health"),
  login: (username: string, password: string) =>
    hub<{ token: string; user: HubUser; message: string }>("/hub/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => hub("/hub/auth/logout", { method: "POST" }),
  me: () => hub<{ user: HubUser }>("/hub/auth/me"),
  listUsers: () => hub<{ users: HubUser[] }>("/hub/users"),
  createUser: (payload: { username: string; password: string; role: string }) =>
    hub("/hub/users", { method: "POST", body: JSON.stringify(payload) }),
  deleteUser: (id: string) => hub(`/hub/users/${id}`, { method: "DELETE" }),
  listInstances: () => hub<{ instances: HubInstance[]; message: string }>("/hub/instances"),
  createInstance: (payload: unknown) =>
    hub("/hub/instances", { method: "POST", body: JSON.stringify(payload) }),
  deleteInstance: (id: string) => hub(`/hub/instances/${id}`, { method: "DELETE" }),
  pingInstance: (id: string) => hub<{ ok: boolean; message: string }>(`/hub/instances/${id}/health`, { method: "POST" }),
  listIndexes: (engineId: string) =>
    hub<{ indexes: IndexInfo[] }>(`/hub/engines/${engineId}/indexes`),
  createIndex: (engineId: string, payload: unknown) =>
    hub(`/hub/engines/${engineId}/indexes`, { method: "POST", body: JSON.stringify(payload) }),
  deleteIndex: (engineId: string, name: string) =>
    hub(`/hub/engines/${engineId}/indexes/${encodeURIComponent(name)}`, { method: "DELETE" }),
  search: (engineId: string, name: string, payload: unknown) =>
    hub<{ message: string; hits: SearchHit[]; total: number }>(
      `/hub/engines/${engineId}/indexes/${encodeURIComponent(name)}/search`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
  indexDoc: (engineId: string, name: string, payload: unknown) =>
    hub(`/hub/engines/${engineId}/indexes/${encodeURIComponent(name)}/documents`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listSpiderConfigs: () => hub<{ configs: SpiderConfigRow[] }>("/hub/spider-configs"),
  saveSpiderConfig: (payload: unknown) =>
    hub("/hub/spider-configs", { method: "POST", body: JSON.stringify(payload) }),
  deleteSpiderConfig: (id: string) => hub(`/hub/spider-configs/${id}`, { method: "DELETE" }),
  runSpider: (id: string) => hub(`/hub/spider-configs/${id}/run`, { method: "POST" }),
  listIndexerConfigs: () => hub<{ configs: IndexerConfigRow[] }>("/hub/indexer-configs"),
  saveIndexerConfig: (payload: unknown) =>
    hub("/hub/indexer-configs", { method: "POST", body: JSON.stringify(payload) }),
  deleteIndexerConfig: (id: string) => hub(`/hub/indexer-configs/${id}`, { method: "DELETE" }),
  runIndexer: (id: string) => hub(`/hub/indexer-configs/${id}/run`, { method: "POST" }),
};

export interface HubUser {
  id: string;
  username: string;
  role: "admin" | "operator" | "viewer";
  createdAt: string;
}

export interface HubInstance {
  id: string;
  name: string;
  kind: "engine" | "indexer" | "spider";
  baseUrl: string;
  enabled: boolean;
  hasApiKey?: boolean;
  notes?: string;
  createdAt: string;
}

export interface IndexInfo {
  name: string;
  docCount: number;
  mappings: Record<string, { type: string }>;
}

export interface SearchHit {
  id: string;
  score: number;
  source: { fields: Record<string, unknown> };
  distanceKm?: number;
}

export interface SpiderConfigRow {
  id: string;
  name: string;
  description?: string;
  instanceId?: string;
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
