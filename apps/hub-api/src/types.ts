/**
 * Hub control-plane types — RBAC, instances, jobs, audit.
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
  | "search:run"
  | "jobs:read"
  | "jobs:manage"
  | "audit:read";

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
    "jobs:read",
    "jobs:manage",
    "audit:read",
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
    "jobs:read",
    "jobs:manage",
    "audit:read",
  ],
  viewer: ["instances:read", "indexes:read", "search:run", "jobs:read", "audit:read"],
};

/** Optional field-level ACL per role (admin / empty list = all fields). */
export interface RoleFieldAcl {
  allowedFields?: string[];
}

export function can(role: HubRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export type InstanceKind =
  | "engine"
  | "indexer"
  | "spider"
  | "elasticsearch"
  | "opensearch"
  | "solr";

/** Instance kinds that expose index list + search through Hub. */
export const HUB_SEARCH_INSTANCE_KINDS: InstanceKind[] = [
  "engine",
  "elasticsearch",
  "opensearch",
  "solr",
];

export function isHubSearchInstanceKind(kind: string): kind is InstanceKind {
  return (HUB_SEARCH_INSTANCE_KINDS as readonly string[]).includes(kind);
}

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
  /** Legacy / demo plaintext — never persisted when secrets key is set. */
  apiKey?: string;
  /** AES-256-GCM encrypted credential (ciphertext + iv + tag). */
  apiKeyEnc?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt?: string;
  notes?: string;
}

export interface StoredSpiderConfig {
  id: string;
  name: string;
  description?: string;
  instanceId?: string;
  /** Target engine index for auto-index after crawl. */
  indexName?: string;
  /** When true, Hub asks spider to push pages to the indexer after crawl. */
  autoIndex?: boolean;
  indexerInstanceId?: string;
  engineInstanceId?: string;
  config: Record<string, unknown>;
  updatedAt: string;
}

export interface StoredIndexerConfig {
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

export type HubJobKind = "spider" | "indexer";
export type HubJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown";

export interface HubJob {
  id: string;
  kind: HubJobKind;
  status: HubJobStatus;
  message: string;
  configId?: string;
  configName?: string;
  instanceId?: string;
  remoteJobId?: string;
  output?: string;
  /** Live / captured worker log lines (spider crawl, indexer progress). */
  logs?: string[];
  indexName?: string;
  pagesIndexed?: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId?: string;
  actorName?: string;
  action: string;
  target?: string;
  detail?: string;
  ok: boolean;
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
  jobs: HubJob[];
  auditLog: AuditEntry[];
  /** Per-role field ACL for search result filtering. */
  roleFieldAcl?: Partial<Record<HubRole, RoleFieldAcl>>;
}

/** Resolve allowed search fields for a role (null = all fields). */
export function allowedFieldsForRole(
  role: HubRole,
  acl?: Partial<Record<HubRole, RoleFieldAcl>>,
): string[] | null {
  if (role === "admin") return null;
  const fields = acl?.[role]?.allowedFields;
  if (!fields?.length) return null;
  return fields;
}

export type FieldType =
  | "text"
  | "keyword"
  | "number"
  | "boolean"
  | "date"
  | "vector"
  | "geo_point";

export interface FieldMapping {
  type: FieldType;
  store?: boolean;
  index?: boolean;
}
