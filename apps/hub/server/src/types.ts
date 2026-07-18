/**
 * Hub control-plane types — RBAC, instances, stored configs.
 */
export type HubRole = "admin" | "operator" | "viewer";

export type Permission =
  | "users:manage"
  | "instances:manage"
  | "instances:read"
  | "indexes:manage"
  | "indexes:read"
  | "spider:manage"
  | "spider:run"
  | "indexer:manage"
  | "indexer:run"
  | "search:run";

export const ROLE_PERMISSIONS: Record<HubRole, Permission[]> = {
  admin: [
    "users:manage",
    "instances:manage",
    "instances:read",
    "indexes:manage",
    "indexes:read",
    "spider:manage",
    "spider:run",
    "indexer:manage",
    "indexer:run",
    "search:run",
  ],
  operator: [
    "instances:read",
    "indexes:manage",
    "indexes:read",
    "spider:manage",
    "spider:run",
    "indexer:manage",
    "indexer:run",
    "search:run",
  ],
  viewer: ["instances:read", "indexes:read", "search:run"],
};

export function can(role: HubRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export type InstanceKind = "engine" | "indexer" | "spider";

export interface HubUser {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  role: HubRole;
  createdAt: string;
}

export interface HubInstance {
  id: string;
  name: string;
  kind: InstanceKind;
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
  createdAt: string;
  notes?: string;
}

export interface StoredSpiderConfig {
  id: string;
  name: string;
  description?: string;
  /** Prefer a registered spider instance; jobs can also run against any spider URL. */
  instanceId?: string;
  config: Record<string, unknown>;
  updatedAt: string;
}

export interface StoredIndexerConfig {
  id: string;
  name: string;
  description?: string;
  instanceId?: string;
  /** Target engine instance id for HTTP bulk index. */
  engineInstanceId?: string;
  indexName: string;
  inputPath?: string;
  batchSize?: number;
  updatedAt: string;
}

export interface HubSession {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface HubState {
  users: HubUser[];
  instances: HubInstance[];
  spiderConfigs: StoredSpiderConfig[];
  indexerConfigs: StoredIndexerConfig[];
  sessions: HubSession[];
}
