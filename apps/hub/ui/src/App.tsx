import React, { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import {
  api,
  getToken,
  setToken,
  HUB_SEARCH_INSTANCE_KINDS,
  type HubUser,
  type HubInstance,
  type HubInstanceKind,
  type IndexInfo,
  type IndexDetail,
  type IndexedDocument,
  type IndexerConfigRow,
  type SpiderConfigRow,
  type HubJob,
  type AuditEntry,
} from "./api";
import { DashboardPanel } from "./panels/Dashboard";
import { SearchPanel } from "./panels/Search";
import { SpiderPanel } from "./panels/Spider";
import { JobsPanel } from "./panels/Jobs";
import { AppearancePanel } from "./panels/Appearance";
import { Pager } from "./components/Pager";
import { WEB_MAPPINGS_JSON, WEB_SEED_MAPPINGS_JSON, WEB_SETTINGS } from "./web-mappings";

type Tab =
  | "dashboard"
  | "instances"
  | "indexes"
  | "documents"
  | "search"
  | "spider"
  | "indexer"
  | "jobs"
  | "audit"
  | "users"
  | "appearance";

// ─── Drawer ──────────────────────────────────────────────────────────────────

function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-head">
          <h2>{title}</h2>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Close drawer">
            ✕
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "done" || status === "completed"
      ? "ok"
      : status === "running" || status === "pending" || status === "queued"
      ? "warn"
      : status === "failed" || status === "error"
      ? "err"
      : "";
  return <span className={`badge ${cls}`}>{status}</span>;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export function App() {
  const [user, setUser] = useState<HubUser | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<"ok" | "err" | "">("");
  const [pending, start] = useTransition();

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");

  const [instances, setInstances] = useState<HubInstance[]>([]);
  const [engineId, setEngineId] = useState("");
  const [indexName, setIndexName] = useState("");
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [spiderConfigs, setSpiderConfigs] = useState<SpiderConfigRow[]>([]);
  const [indexerConfigs, setIndexerConfigs] = useState<IndexerConfigRow[]>([]);
  const [users, setUsers] = useState<HubUser[]>([]);
  const [jobs, setJobs] = useState<HubJob[]>([]);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditFrom, setAuditFrom] = useState(0);
  const auditPageSize = 20;
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersFrom, setUsersFrom] = useState(0);
  const usersPageSize = 20;

  const engines = useMemo(
    () => instances.filter((i) => HUB_SEARCH_INSTANCE_KINDS.includes(i.kind)),
    [instances],
  );
  const spiders = useMemo(() => instances.filter((i) => i.kind === "spider"), [instances]);
  const indexers = useMemo(() => instances.filter((i) => i.kind === "indexer"), [instances]);

  function flash(msg: string, t: "ok" | "err" = "ok") {
    setStatus(msg);
    setTone(t);
  }

  async function refreshAll() {
    const [inst] = await Promise.all([api.listInstances()]);
    setInstances(inst.instances);
    if (!engineId) {
      const eng = inst.instances.find((i) => HUB_SEARCH_INSTANCE_KINDS.includes(i.kind));
      if (eng) setEngineId(eng.id);
    }
  }

  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then(async (r) => {
        setUser(r.user);
        await refreshAll();
      })
      .catch(() => setToken(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user || !engineId) return;
    api
      .listIndexes(engineId)
      .then((r) => setIndexes(r.indexes ?? []))
      .catch((e) => flash(e.message, "err"));
  }, [user, engineId]);

  useEffect(() => {
    if (!user) return;
    if (tab === "spider") {
      api
        .listSpiderConfigs()
        .then((r) => setSpiderConfigs(r.configs))
        .catch((e) => flash(e.message, "err"));
    }
    if (tab === "indexer") {
      api
        .listIndexerConfigs()
        .then((r) => setIndexerConfigs(r.configs))
        .catch((e) => flash(e.message, "err"));
    }
    if (tab === "users" && user.role === "admin") {
      api
        .listUsers(usersFrom, usersPageSize)
        .then((r) => {
          setUsers(r.users);
          setUsersTotal(r.total);
        })
        .catch((e) => flash(e.message, "err"));
    }
    if (tab === "jobs") {
      /* JobsPanel loads its own paginated data */
    }
    if (tab === "audit") {
      api
        .listAudit(auditFrom, auditPageSize)
        .then((r) => {
          setAuditEntries(r.entries);
          setAuditTotal(r.total);
        })
        .catch((e) => flash(e.message, "err"));
    }
    if (tab === "dashboard") {
      Promise.all([api.listJobs(0, 5), api.listAudit(0, 5)])
        .then(([j, a]) => {
          setJobs(j.jobs);
          setJobsTotal(j.total);
          setAuditEntries(a.entries);
          setAuditTotal(a.total);
        })
        .catch(() => undefined);
    }
  }, [user, tab, auditFrom, usersFrom]);

  // ── Login ──────────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <div className="login-wrap">
        <a className="skip" href="#login">
          Skip to login
        </a>
        <form
          id="login"
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              try {
                const res = await api.login(username, password);
                setToken(res.token);
                setUser(res.user);
                flash(res.message);
                await refreshAll();
              } catch (err) {
                flash(err instanceof Error ? err.message : "Login failed", "err");
              }
            });
          }}
        >
          <p className="eyebrow">VaagaTech</p>
          <h1>Anvesh</h1>
          <p className="support">
            Hub control plane — digital transformation search, built to ship.
          </p>
          <div className="field">
            <label htmlFor="hub-user">Username</label>
            <input
              id="hub-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label htmlFor="hub-pass">Password</label>
            <input
              id="hub-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
          {status && (
            <p className={`status ${tone}`} role="status" aria-live="polite">
              {status}
            </p>
          )}
        </form>
      </div>
    );
  }

  // ── Shell ──────────────────────────────────────────────────────────────────

  const navGroups: {
    label: string;
    items: { id: Tab; label: string; show?: boolean }[];
  }[] = [
    {
      label: "Operate",
      items: [
        { id: "dashboard", label: "Dashboard" },
        { id: "instances", label: "Instances" },
        { id: "indexes", label: "Indexes" },
        { id: "documents", label: "Documents" },
        { id: "search", label: "Search" },
      ],
    },
    {
      label: "Pipeline",
      items: [
        { id: "spider", label: "Crawl", show: user.role !== "viewer" },
        { id: "indexer", label: "Bulk import", show: user.role !== "viewer" },
        { id: "jobs", label: "Jobs" },
      ],
    },
    {
      label: "Admin",
      items: [
        { id: "audit", label: "Audit" },
        { id: "users", label: "Users", show: user.role === "admin" },
        { id: "appearance", label: "Appearance", show: true },
      ],
    },
  ];

  const tabLabels: Record<Tab, string> = {
    dashboard: "Dashboard",
    instances: "Instances",
    indexes: "Indexes",
    documents: "Documents",
    search: "Search",
    spider: "Crawl",
    indexer: "Bulk import",
    jobs: "Jobs",
    audit: "Audit",
    users: "Users",
    appearance: "Appearance",
  };

  const ledes: Partial<Record<Tab, string>> = {
    dashboard: "Fleet health, setup checklist, and what to do next",
    instances: "Engine, spider, and indexer workers Hub can control",
    indexes: "Create and inspect indexes on the active engine",
    documents: "Browse, validate, and ingest JSON into the active index",
    search: "Keyword, hybrid, semantic, and geo — with query toggles",
    spider: "Crawl a site and auto-index pages into the engine (no files)",
    indexer: "Upload JSON for bulk ingest — file paths are advanced only",
    jobs: "Live crawl/index logs and pipeline history",
    audit: "Who did what, when",
    users: "RBAC accounts for this Hub",
    appearance: "Theme and density preferences for this browser",
  };

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="shell">
        <aside className="nav" aria-label="Hub navigation">
          <p className="brand">Anvesh</p>
          <p className="brand-sub">VaagaTech · Hub · {user.role}</p>
          {navGroups.map((group) => {
            const visible = group.items.filter((n) => n.show !== false);
            if (visible.length === 0) return null;
            return (
              <div key={group.label} className="nav-group">
                <p className="nav-label">{group.label}</p>
                {visible.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={`nav-item${tab === n.id ? " active" : ""}`}
                    onClick={() => setTab(n.id)}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            );
          })}
        </aside>

        <div className="main" id="main">
          <div className="topbar">
            <div>
              <h1>{tabLabels[tab]}</h1>
              {ledes[tab] && <p className="lede">{ledes[tab]}</p>}
            </div>
            <div className="row">
              <span className="user-chip">
                {user.username}
                <span className={`role-pill ${user.role}`}>{user.role}</span>
              </span>
              <button
                type="button"
                className="btn secondary"
                aria-label="Sign out"
                onClick={() =>
                  start(async () => {
                    await api.logout().catch(() => undefined);
                    setToken(null);
                    setUser(null);
                  })
                }
              >
                Sign out
              </button>
            </div>
          </div>

          {status && (
            <div className={`banner ${tone}`} role="status" aria-live="polite">
              {status}
            </div>
          )}

          <div className="context-bar" aria-label="Active engine and index">
            <div className="field">
              <label>Active engine</label>
              <select
                value={engineId}
                onChange={(e) => setEngineId(e.target.value)}
                aria-label="Active engine"
              >
                <option value="">Select engine…</option>
                {engines.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Active index</label>
              <select
                value={indexName}
                onChange={(e) => setIndexName(e.target.value)}
                aria-label="Active index"
              >
                <option value="">Select index…</option>
                {indexes.map((i) => (
                  <option key={i.name} value={i.name}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="hint context-hint">
              Shared across Indexes, Documents, and Search.
            </p>
          </div>

          {tab === "dashboard" && (
            <DashboardPanel
              engines={engines}
              spiders={spiders}
              indexers={indexers}
              instances={instances}
              jobs={jobs}
              auditEntries={auditEntries}
              onNavigate={setTab}
              engineId={engineId}
              indexCount={indexes.length}
            />
          )}

          {tab === "instances" && (
            <InstancesPanel
              instances={instances}
              onChange={refreshAll}
              flash={flash}
              canManage={user.role === "admin"}
            />
          )}

          {tab === "indexes" && (
            <IndexesPanel
              engines={engines}
              engineId={engineId}
              setEngineId={setEngineId}
              indexes={indexes}
              setIndexes={setIndexes}
              flash={flash}
              canManage={user.role !== "viewer"}
              onNavigateDocuments={(name) => {
                if (name) setIndexName(name);
                setTab("documents");
              }}
            />
          )}

          {tab === "documents" && (
            <DocumentsPanel
              engines={engines}
              engineId={engineId}
              setEngineId={setEngineId}
              indexes={indexes}
              indexName={indexName}
              setIndexName={setIndexName}
              flash={flash}
              onSearch={() => setTab("search")}
            />
          )}

          {tab === "search" && (
            <SearchPanel
              engines={engines}
              engineId={engineId}
              setEngineId={setEngineId}
              indexes={indexes}
              indexName={indexName}
              setIndexName={setIndexName}
              flash={flash}
            />
          )}

          {tab === "spider" && user.role !== "viewer" && (
            <SpiderPanel
              configs={spiderConfigs}
              spiders={spiders}
              indexers={indexers}
              engines={engines}
              engineId={engineId}
              setEngineId={setEngineId}
              onRefresh={() =>
                api.listSpiderConfigs().then((r) => setSpiderConfigs(r.configs))
              }
              flash={flash}
              onGoJobs={() => setTab("jobs")}
            />
          )}

          {tab === "indexer" && user.role !== "viewer" && (
            <IndexerPanel
              configs={indexerConfigs}
              indexers={indexers}
              engines={engines}
              onRefresh={() =>
                api.listIndexerConfigs().then((r) => setIndexerConfigs(r.configs))
              }
              flash={flash}
              onGoJobs={() => setTab("jobs")}
            />
          )}

          {tab === "jobs" && (
            <JobsPanel flash={flash} canManage={user.role !== "viewer"} />
          )}

          {tab === "audit" && (
            <AuditPanel
              entries={auditEntries}
              total={auditTotal}
              from={auditFrom}
              pageSize={auditPageSize}
              onPage={(next) => setAuditFrom(next)}
            />
          )}

          {tab === "users" && user.role === "admin" && (
            <UsersPanel
              users={users}
              total={usersTotal}
              from={usersFrom}
              pageSize={usersPageSize}
              onPage={setUsersFrom}
              onRefresh={() =>
                api.listUsers(usersFrom, usersPageSize).then((r) => {
                  setUsers(r.users);
                  setUsersTotal(r.total);
                })
              }
              flash={flash}
            />
          )}

          {tab === "appearance" && <AppearancePanel flash={flash} />}
        </div>
      </div>
    </>
  );
}

// ─── InstancesPanel ───────────────────────────────────────────────────────────

function InstancesPanel({
  instances,
  onChange,
  flash,
  canManage,
}: {
  instances: HubInstance[];
  onChange: () => Promise<void>;
  flash: (m: string, t?: "ok" | "err") => void;
  canManage: boolean;
}) {
  const [name, setName] = useState("local-engine");
  const [kind, setKind] = useState<HubInstanceKind>("engine");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:3848");
  const [apiKey, setApiKey] = useState("");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);

  const [editTarget, setEditTarget] = useState<HubInstance | null>(null);
  const [editName, setEditName] = useState("");
  const [editKind, setEditKind] = useState<"engine" | "indexer" | "spider">("engine");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editEnabled, setEditEnabled] = useState(true);

  function openEdit(i: HubInstance) {
    setEditTarget(i);
    setEditName(i.name);
    setEditKind(i.kind);
    setEditBaseUrl(i.baseUrl);
    setEditApiKey("");
    setEditNotes(i.notes ?? "");
    setEditEnabled(i.enabled);
  }

  return (
    <>
      {canManage && (
        <section className="panel">
          <div className="panel-head">
            <h2>Register instance</h2>
          </div>
          <p className="hint">
            Run multiple engines, indexers, or spiders and point Hub at each base URL.
          </p>
          <div className="grid-3">
            <div className="field">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>Kind</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                <option value="engine">engine</option>
                <option value="indexer">indexer</option>
                <option value="spider">spider</option>
              </select>
            </div>
            <div className="field">
              <label>Base URL</label>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label>API key</label>
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="optional"
              />
            </div>
            <div className="field">
              <label>Notes</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="optional"
              />
            </div>
          </div>
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />{" "}
              Enabled
            </label>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void api
                .createInstance({
                  name,
                  kind,
                  baseUrl,
                  apiKey: apiKey || undefined,
                  notes: notes || undefined,
                  enabled,
                })
                .then(async (r) => {
                  flash((r as { message: string }).message);
                  await onChange();
                })
                .catch((e) => flash(e.message, "err"))
            }
          >
            Add instance
          </button>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Registered instances</h2>
        </div>
        {instances.length === 0 ? (
          <p className="hint">No instances yet. Register an engine to get started.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>URL</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td>
                    <span className="badge">{i.kind}</span>
                  </td>
                  <td>{i.baseUrl}</td>
                  <td>
                    <span className={`badge ${i.enabled ? "ok" : ""}`}>
                      {i.enabled ? "enabled" : "disabled"}
                    </span>
                  </td>
                  <td className="row">
                    <button
                      type="button"
                      className="btn secondary"
                      aria-label={`Health check ${i.name}`}
                      onClick={() =>
                        void api
                          .healthInstance(i.id)
                          .then((r) =>
                            flash(
                              (r as { message?: string }).message ?? "Reachable",
                              "ok"
                            )
                          )
                          .catch((e) => flash(e.message, "err"))
                      }
                    >
                      Health
                    </button>
                    {canManage && (
                      <>
                        <button
                          type="button"
                          className="btn secondary"
                          aria-label={`Edit ${i.name}`}
                          onClick={() => openEdit(i)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn danger"
                          aria-label={`Delete ${i.name}`}
                          onClick={() =>
                            void api
                              .deleteInstance(i.id)
                              .then(async () => {
                                flash("Instance removed.");
                                await onChange();
                              })
                              .catch((e) => flash(e.message, "err"))
                          }
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {editTarget && (
        <Drawer
          title={`Edit instance — ${editTarget.name}`}
          onClose={() => setEditTarget(null)}
        >
          <div className="grid-2">
            <div className="field">
              <label>Name</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="field">
              <label>Kind</label>
              <select
                value={editKind}
                onChange={(e) => setEditKind(e.target.value as typeof editKind)}
              >
                <option value="engine">engine</option>
                <option value="indexer">indexer</option>
                <option value="spider">spider</option>
              </select>
            </div>
            <div className="field">
              <label>Base URL</label>
              <input
                value={editBaseUrl}
                onChange={(e) => setEditBaseUrl(e.target.value)}
              />
            </div>
            <div className="field">
              <label>New API key</label>
              <input
                type="password"
                autoComplete="off"
                value={editApiKey}
                onChange={(e) => setEditApiKey(e.target.value)}
                placeholder="leave blank to keep current"
              />
            </div>
          </div>
          <div className="field">
            <label>Notes</label>
            <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
          </div>
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={editEnabled}
                onChange={(e) => setEditEnabled(e.target.checked)}
              />{" "}
              Enabled
            </label>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() =>
                void api
                  .updateInstance(editTarget.id, {
                    name: editName,
                    kind: editKind,
                    baseUrl: editBaseUrl,
                    apiKey: editApiKey || undefined,
                    notes: editNotes || undefined,
                    enabled: editEnabled,
                  })
                  .then(async (r) => {
                    flash((r as { message: string }).message);
                    setEditTarget(null);
                    await onChange();
                  })
                  .catch((e) => flash(e.message, "err"))
              }
            >
              Save
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setEditTarget(null)}
            >
              Cancel
            </button>
          </div>
        </Drawer>
      )}
    </>
  );
}

// ─── IndexesPanel ─────────────────────────────────────────────────────────────

function IndexesPanel({
  engines,
  engineId,
  setEngineId,
  indexes,
  setIndexes,
  flash,
  canManage,
  onNavigateDocuments,
}: {
  engines: HubInstance[];
  engineId: string;
  setEngineId: (v: string) => void;
  indexes: IndexInfo[];
  setIndexes: (v: IndexInfo[]) => void;
  flash: (m: string, t?: "ok" | "err") => void;
  canManage: boolean;
  onNavigateDocuments: (indexName?: string) => void;
}) {
  const [name, setName] = useState("articles");
  const [mappingJson, setMappingJson] = useState(WEB_MAPPINGS_JSON);
  const [vectorDimensions, setVectorDimensions] = useState(String(WEB_SETTINGS.vectorDimensions));
  const [detailIndex, setDetailIndex] = useState<IndexDetail | null>(null);

  async function loadIndexes() {
    if (!engineId) return;
    const r = await api.listIndexes(engineId);
    setIndexes(r.indexes ?? []);
  }

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Engine</h2>
        </div>
        <div className="field">
          <label>Engine instance</label>
          <select value={engineId} onChange={(e) => setEngineId(e.target.value)}>
            <option value="">Select…</option>
            {engines.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          {engines.length === 0 && (
            <p className="help">No engine instances registered. Add one under Instances.</p>
          )}
        </div>

        {canManage && engineId && (
          <>
            <h3 style={{ marginTop: "1.25rem" }}>Create index</h3>
            <div className="grid-2">
              <div className="field">
                <label>Index name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label>Vector dimensions</label>
                <input
                  type="number"
                  value={vectorDimensions}
                  onChange={(e) => setVectorDimensions(e.target.value)}
                  placeholder="optional, e.g. 384"
                />
                <p className="help">Default 256 enables local semantic / hybrid without pasting vectors</p>
              </div>
            </div>
            <div className="field">
              <label>Mappings JSON (optional)</label>
              <textarea
                value={mappingJson}
                onChange={(e) => setMappingJson(e.target.value)}
                rows={6}
              />
              <p className="help">
                Leave <code>{`{}`}</code> for a dynamic schema — the engine learns fields from
                documents. Use{" "}
                <button
                  type="button"
                  className="linkish"
                  style={{ background: "none", border: 0, padding: 0, color: "inherit", textDecoration: "underline", cursor: "pointer" }}
                  onClick={() => setMappingJson(WEB_SEED_MAPPINGS_JSON)}
                >
                  web seed mappings
                </button>{" "}
                for preferred crawl field types.
              </p>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                try {
                  const mappings = JSON.parse(mappingJson) as Record<string, unknown>;
                  const settings: Record<string, unknown> = {
                    ...WEB_SETTINGS,
                  };
                  if (vectorDimensions)
                    settings.vectorDimensions = parseInt(vectorDimensions, 10);
                  void api
                    .createIndex(engineId, {
                      name,
                      mappings,
                      settings,
                    })
                    .then(async (r) => {
                      flash((r as { message: string }).message);
                      await loadIndexes();
                    })
                    .catch((e) => flash(e.message, "err"));
                } catch {
                  flash("Mappings must be valid JSON.", "err");
                }
              }}
            >
              Create index
            </button>
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Indexes</h2>
          {engineId && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => void loadIndexes()}
              aria-label="Refresh index list"
            >
              ↻ Refresh
            </button>
          )}
        </div>
        {!engineId ? (
          <p className="hint">Select an engine to list indexes.</p>
        ) : indexes.length === 0 ? (
          <p className="hint">No indexes on this engine yet. Create one above.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Docs</th>
                <th>Fields</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {indexes.map((idx) => (
                <tr key={idx.name}>
                  <td>{idx.name}</td>
                  <td>{idx.docCount ?? "—"}</td>
                  <td>{Object.keys(idx.mappings || {}).join(", ") || "—"}</td>
                  <td className="row">
                    <button
                      type="button"
                      className="btn secondary"
                      aria-label={`View details for ${idx.name}`}
                      onClick={() =>
                        void api
                          .getIndex(engineId, idx.name)
                          .then((r) => setDetailIndex(r.index))
                          .catch((e) => flash(e.message, "err"))
                      }
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      aria-label={`Ingest into ${idx.name}`}
                      onClick={() => onNavigateDocuments(idx.name)}
                    >
                      Ingest →
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        className="btn danger"
                        aria-label={`Delete index ${idx.name}`}
                        onClick={() => {
                          if (!confirm(`Delete index "${idx.name}"? This cannot be undone.`)) return;
                          void api
                            .deleteIndex(engineId, idx.name)
                            .then(async () => {
                              flash(`Index "${idx.name}" deleted.`);
                              await loadIndexes();
                            })
                            .catch((e) => flash(e.message, "err"));
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="hint">
          To ingest documents into an index, use the{" "}
          <button type="button" className="btn ghost" onClick={() => onNavigateDocuments()}>
            Documents tab
          </button>
          .
        </p>
      </section>

      {detailIndex && (
        <Drawer
          title={`Index details — ${detailIndex.name}`}
          onClose={() => setDetailIndex(null)}
        >
          <p className="hint">
            Mappings are fixed at creation time. To remap, recreate the index and re-ingest
            your documents.
          </p>
          <div className="field">
            <label>Document count</label>
            <input readOnly value={detailIndex.docCount ?? "—"} />
          </div>
          <div className="field">
            <label>Mappings (read-only)</label>
            <textarea
              readOnly
              value={JSON.stringify(detailIndex.mappings, null, 2)}
              rows={10}
            />
          </div>
          {detailIndex.settings && Object.keys(detailIndex.settings).length > 0 && (
            <div className="field">
              <label>Settings</label>
              <textarea
                readOnly
                value={JSON.stringify(detailIndex.settings, null, 2)}
                rows={4}
              />
            </div>
          )}
          <button
            type="button"
            className="btn ghost"
            onClick={() => setDetailIndex(null)}
          >
            Close
          </button>
        </Drawer>
      )}
    </>
  );
}

// ─── DocumentsPanel ───────────────────────────────────────────────────────────

function DocumentsPanel({
  engines,
  engineId,
  setEngineId,
  indexes,
  indexName,
  setIndexName,
  flash,
  onSearch,
}: {
  engines: HubInstance[];
  engineId: string;
  setEngineId: (v: string) => void;
  indexes: IndexInfo[];
  indexName: string;
  setIndexName: (v: string) => void;
  flash: (m: string, t?: "ok" | "err") => void;
  onSearch: () => void;
}) {
  const [indexDetail, setIndexDetail] = useState<IndexDetail | null>(null);
  const [docsJson, setDocsJson] = useState(`[
  {
    "id": "doc-1",
    "fields": {
      "title": "Hello Anvesh",
      "body": "Lightweight search by VaagaTech",
      "url": "https://www.vaagatech.com/"
    }
  }
]`);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  const [validated, setValidated] = useState(false);
  const [listed, setListed] = useState<IndexedDocument[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listFrom, setListFrom] = useState(0);
  const listSize = 20;

  useEffect(() => {
    if (!indexName && indexes[0]) setIndexName(indexes[0].name);
  }, [indexes, indexName, setIndexName]);

  useEffect(() => {
    if (!engineId || !indexName) {
      setIndexDetail(null);
      return;
    }
    api
      .getIndex(engineId, indexName)
      .then((r) => setIndexDetail(r.index))
      .catch(() => setIndexDetail(null));
  }, [engineId, indexName]);

  async function refreshList(nextFrom = listFrom) {
    if (!engineId || !indexName) return;
    try {
      const r = await api.listDocuments(engineId, indexName, nextFrom, listSize);
      setListed(r.documents ?? []);
      setListTotal(r.total ?? 0);
      setListFrom(nextFrom);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not list documents", "err");
    }
  }

  useEffect(() => {
    if (engineId && indexName) void refreshList(0);
    else {
      setListed([]);
      setListTotal(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineId, indexName]);

  function parseDocs(): unknown[] | null {
    try {
      const parsed = JSON.parse(docsJson) as unknown;
      if (Array.isArray(parsed)) return parsed;
      if (
        parsed &&
        typeof parsed === "object" &&
        "documents" in parsed &&
        Array.isArray((parsed as Record<string, unknown>).documents)
      ) {
        return (parsed as { documents: unknown[] }).documents;
      }
      return [parsed];
    } catch {
      return null;
    }
  }

  function handleFileImport(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const parsed = JSON.parse(text) as unknown;
        setDocsJson(JSON.stringify(parsed, null, 2));
        flash("File loaded.", "ok");
      } catch {
        const lines = text.split("\n").filter((l) => l.trim());
        try {
          const docs = lines.map((l) => JSON.parse(l) as unknown);
          setDocsJson(JSON.stringify(docs, null, 2));
          flash(`Loaded ${docs.length} document(s) from JSONL.`, "ok");
        } catch {
          flash("Could not parse file as JSON or JSONL.", "err");
        }
      }
    };
    reader.readAsText(file);
  }

  function previewFields(doc: IndexedDocument): string {
    const fields = doc.fields ?? {};
    const title = fields.title ?? fields.url ?? fields.body;
    if (title != null) return String(title).slice(0, 120);
    return JSON.stringify(fields).slice(0, 120);
  }

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Browse documents</h2>
          <p className="hint">Inspect what is already in the index — delete or clear as needed.</p>
        </div>

        <div className="grid-2">
          <div className="field">
            <label>Engine</label>
            <select value={engineId} onChange={(e) => setEngineId(e.target.value)}>
              <option value="">Select…</option>
              {engines.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Index</label>
            <select value={indexName} onChange={(e) => setIndexName(e.target.value)}>
              <option value="">Select…</option>
              {indexes.map((i) => (
                <option key={i.name} value={i.name}>
                  {i.name}
                  {i.docCount != null ? ` (${i.docCount})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row" style={{ marginBottom: "0.75rem" }}>
          <button
            type="button"
            className="btn secondary"
            disabled={!engineId || !indexName}
            onClick={() => void refreshList(listFrom)}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={!engineId || !indexName || listTotal === 0}
            onClick={() => {
              if (!confirm(`Clear all ${listTotal} document(s) from "${indexName}"?`)) return;
              void api
                .clearDocuments(engineId, indexName)
                .then((r) => {
                  flash(r.message ?? `Cleared ${r.deleted} document(s).`, "ok");
                  void refreshList(0);
                })
                .catch((e) => flash(e.message, "err"));
            }}
          >
            Clear index
          </button>
          <span className="hint" style={{ marginLeft: "auto" }}>
            {listTotal} document(s)
          </span>
        </div>

        {listed.length === 0 ? (
          <p className="hint">No documents yet — ingest below, seed the demo, or run a spider crawl.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Preview</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {listed.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <code>{doc.id}</code>
                    </td>
                    <td>{previewFields(doc)}</td>
                    <td>{doc.updatedAt ? new Date(doc.updatedAt).toLocaleString() : "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => {
                          if (!confirm(`Delete document ${doc.id}?`)) return;
                          void api
                            .deleteDocument(engineId, indexName, doc.id)
                            .then(() => {
                              flash(`Deleted ${doc.id}.`, "ok");
                              void refreshList(listFrom);
                            })
                            .catch((e) => flash(e.message, "err"));
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {listTotal > listSize && (
          <Pager
            from={listFrom}
            size={listSize}
            total={listTotal}
            onChange={(next) => void refreshList(next)}
          />
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Ingest documents</h2>
        </div>

        {indexDetail && (
          <p className="hint" style={{ marginBottom: "0.75rem" }}>
            <strong>Mapping:</strong>{" "}
            {Object.entries(indexDetail.mappings)
              .map(([k, v]) => `${k} (${v.type})`)
              .join(", ")}
            {indexDetail.settings?.vectorDimensions != null && (
              <>
                {" "}
                · vectors {String(indexDetail.settings.vectorDimensions)} (local auto-embed)
              </>
            )}
          </p>
        )}

        <div className="field">
          <label>Import from file</label>
          <input
            type="file"
            accept=".json,.jsonl"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileImport(file);
            }}
          />
          <p className="help">Upload a .json or .jsonl file to populate the textarea below</p>
        </div>

        <div className="field">
          <label>Documents JSON</label>
          <textarea
            value={docsJson}
            onChange={(e) => {
              setDocsJson(e.target.value);
              setValidated(false);
              setIssues([]);
            }}
            rows={10}
            placeholder={`Single doc:   {"id":"1","fields":{"title":"…"}}\nArray:        [{"fields":{"title":"…"}}]\nWith wrapper: {"documents":[…]}`}
          />
        </div>

        {issues.length > 0 && (
          <ul className="issues" aria-label="Validation issues">
            {issues.map((iss, idx) => (
              <li key={idx}>
                <strong>{iss.path}</strong>: {iss.message}
              </li>
            ))}
          </ul>
        )}

        <div className="row">
          <button
            type="button"
            className="btn secondary"
            disabled={!engineId || !indexName || !docsJson.trim()}
            onClick={() => {
              const docs = parseDocs();
              if (!docs) {
                flash("Invalid JSON.", "err");
                return;
              }
              void api
                .validateDocs(engineId, indexName, docs)
                .then((r) => {
                  setIssues(r.issues ?? []);
                  setValidated(r.ok);
                  if (r.ok) flash("Validation passed.", "ok");
                  else flash(`${r.issues.length} validation issue(s).`, "err");
                })
                .catch((e) => flash(e.message, "err"));
            }}
          >
            Validate
          </button>
          <button
            type="button"
            className="btn"
            disabled={!engineId || !indexName || !docsJson.trim()}
            onClick={() => {
              const docs = parseDocs();
              if (!docs) {
                flash("Invalid JSON.", "err");
                return;
              }
              void api
                .ingestDocs(engineId, indexName, docs)
                .then((r) => {
                  flash(
                    (r as { message?: string }).message ??
                      `Ingested ${docs.length} document(s).`,
                    "ok",
                  );
                  void refreshList(0);
                })
                .catch((e) => flash(e.message, "err"));
            }}
          >
            {validated ? "Index (validated)" : "Import"}
          </button>
          <button type="button" className="btn secondary" onClick={onSearch}>
            Search this index →
          </button>
        </div>
      </section>
    </>
  );
}

// ─── IndexerPanel ─────────────────────────────────────────────────────────────

function IndexerPanel({
  configs,
  indexers,
  engines,
  onRefresh,
  flash,
  onGoJobs,
}: {
  configs: IndexerConfigRow[];
  indexers: HubInstance[];
  engines: HubInstance[];
  onRefresh: () => Promise<unknown> | unknown;
  flash: (m: string, t?: "ok" | "err") => void;
  onGoJobs: () => void;
}) {
  const enabledIndexers = useMemo(() => indexers.filter((s) => s.enabled), [indexers]);
  const enabledEngines = useMemo(() => engines.filter((s) => s.enabled), [engines]);

  const [engineInstanceId, setEngineInstanceId] = useState(
    () => enabledEngines[0]?.id ?? "",
  );
  const [bulkIndexName, setBulkIndexName] = useState("articles");
  const [docsJson, setDocsJson] = useState(`[
  {
    "id": "doc-1",
    "fields": {
      "title": "Hello Anvesh",
      "body": "Lightweight search by VaagaTech",
      "url": "https://www.vaagatech.com/"
    }
  }
]`);
  const [showFileConfigs, setShowFileConfigs] = useState(false);

  const [name, setName] = useState("bulk-web");
  const [indexName, setIndexName] = useState("articles");
  const [inputPath, setInputPath] = useState(".anvesh/crawl/out.jsonl");
  const [instanceId, setInstanceId] = useState(() => enabledIndexers[0]?.id ?? "");

  const [editTarget, setEditTarget] = useState<IndexerConfigRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editIndexName, setEditIndexName] = useState("");
  const [editInputPath, setEditInputPath] = useState("");
  const [editInstanceId, setEditInstanceId] = useState("");
  const [editEngineInstanceId, setEditEngineInstanceId] = useState("");
  const [editBatchSize, setEditBatchSize] = useState("");

  useEffect(() => {
    if (!instanceId && enabledIndexers[0]) setInstanceId(enabledIndexers[0].id);
  }, [enabledIndexers, instanceId]);

  useEffect(() => {
    if (!engineInstanceId && enabledEngines[0])
      setEngineInstanceId(enabledEngines[0].id);
  }, [enabledEngines, engineInstanceId]);

  function openEdit(c: IndexerConfigRow) {
    setEditTarget(c);
    setEditName(c.name);
    setEditIndexName(c.indexName);
    setEditInputPath(c.inputPath ?? "");
    setEditInstanceId(c.instanceId ?? "");
    setEditEngineInstanceId(c.engineInstanceId ?? "");
    setEditBatchSize(c.batchSize !== undefined ? String(c.batchSize) : "");
  }

  function indexerLabel(id?: string) {
    if (!id) return "Not assigned";
    const s = indexers.find((x) => x.id === id);
    if (!s) return "Missing instance";
    return s.enabled ? s.name : `${s.name} (disabled)`;
  }

  function parseDocs(): unknown[] | null {
    try {
      const parsed = JSON.parse(docsJson) as unknown;
      if (Array.isArray(parsed)) return parsed;
      if (
        parsed &&
        typeof parsed === "object" &&
        "documents" in parsed &&
        Array.isArray((parsed as Record<string, unknown>).documents)
      ) {
        return (parsed as { documents: unknown[] }).documents;
      }
      return [parsed];
    } catch {
      return null;
    }
  }

  function handleFileImport(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const parsed = JSON.parse(text) as unknown;
        setDocsJson(JSON.stringify(parsed, null, 2));
        flash("File loaded.", "ok");
      } catch {
        const lines = text.split("\n").filter((l) => l.trim());
        try {
          const docs = lines.map((l) => JSON.parse(l) as unknown);
          setDocsJson(JSON.stringify(docs, null, 2));
          flash(`Loaded ${docs.length} document(s) from JSONL.`, "ok");
        } catch {
          flash("Could not parse file as JSON or JSONL.", "err");
        }
      }
    };
    reader.readAsText(file);
  }

  async function ensureIndexOnEngine(engineId: string, targetIndex: string) {
    const existing = await api.listIndexes(engineId);
    if (existing.indexes?.some((i) => i.name === targetIndex)) return;
    await api.createIndex(engineId, {
      name: targetIndex,
      mappings: JSON.parse(WEB_SEED_MAPPINGS_JSON) as Record<string, unknown>,
      settings: { ...WEB_SETTINGS },
    });
  }

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>JSON bulk import</h2>
          <p className="hint">
            Upload documents and bulk-index into the engine. Creates the index with dynamic schema
            (web seed mappings) if missing.
          </p>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Engine instance</label>
            <select
              value={engineInstanceId}
              onChange={(e) => setEngineInstanceId(e.target.value)}
            >
              <option value="">Select…</option>
              {enabledEngines.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Target index</label>
            <input
              value={bulkIndexName}
              onChange={(e) => setBulkIndexName(e.target.value)}
              placeholder="e.g. articles"
            />
          </div>
        </div>
        <div className="field">
          <label>Import from file</label>
          <input
            type="file"
            accept=".json,.jsonl"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileImport(file);
            }}
          />
          <p className="help">Upload a .json array or .jsonl file</p>
        </div>
        <div className="field">
          <label>Documents JSON</label>
          <textarea value={docsJson} onChange={(e) => setDocsJson(e.target.value)} rows={10} />
        </div>
        <button
          type="button"
          className="btn"
          disabled={!engineInstanceId || !bulkIndexName.trim() || !docsJson.trim()}
          onClick={() => {
            const docs = parseDocs();
            if (!docs) {
              flash("Invalid JSON.", "err");
              return;
            }
            const target = bulkIndexName.trim();
            void ensureIndexOnEngine(engineInstanceId, target)
              .then(() => api.ingestDocs(engineInstanceId, target, docs, false))
              .then((r) => {
                flash(
                  (r as { message?: string }).message ??
                    `Imported ${docs.length} document(s) into "${target}".`,
                  "ok",
                );
              })
              .catch((e) => flash(e.message, "err"));
          }}
        >
          Import to engine
        </button>
      </section>

      <section className="panel">
        <button
          type="button"
          className="btn ghost"
          onClick={() => setShowFileConfigs((v) => !v)}
        >
          {showFileConfigs ? "Hide advanced file-based configs" : "Advanced: file-based configs"}
        </button>
        {showFileConfigs && (
          <>
            <p className="hint" style={{ marginTop: "0.75rem" }}>
              Optional path on the indexer host — prefer JSON upload above or Crawl auto-index.
            </p>
            {enabledIndexers.length === 0 && (
              <div className="banner err">
                No enabled indexer instances. Run <code>npm start</code> or add kind{" "}
                <strong>indexer</strong> → <code>http://127.0.0.1:3852</code>.
              </div>
            )}
            <div className="grid-2">
              <div className="field">
                <label>Config name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label>Target index name</label>
                <input value={indexName} onChange={(e) => setIndexName(e.target.value)} />
              </div>
              <div className="field">
                <label>Input path (JSONL on indexer host)</label>
                <input value={inputPath} onChange={(e) => setInputPath(e.target.value)} />
              </div>
              <div className="field">
                <label>Indexer instance</label>
                <select value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
                  <option value="">Select…</option>
                  {enabledIndexers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                if (!instanceId) {
                  flash("Select an enabled indexer instance before saving.", "err");
                  return;
                }
                void api
                  .saveIndexerConfig({
                    name,
                    indexName,
                    inputPath,
                    instanceId,
                    engineInstanceId: engineInstanceId || undefined,
                  })
                  .then(async (r) => {
                    flash((r as { message: string }).message);
                    await onRefresh();
                  })
                  .catch((e) => flash(e.message, "err"));
              }}
            >
              Save file config
            </button>

            {configs.length === 0 ? (
              <p className="hint">No file-based configs saved.</p>
            ) : (
              <table className="table" style={{ marginTop: "1rem" }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Index</th>
                    <th>Path</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {configs.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.indexName}</td>
                      <td>
                        <code>{c.inputPath || "—"}</code>
                      </td>
                      <td className="row">
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => openEdit(c)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            if (
                              !c.instanceId ||
                              !enabledIndexers.some((s) => s.id === c.instanceId)
                            ) {
                              flash(
                                "Assign an enabled indexer instance before running.",
                                "err",
                              );
                              return;
                            }
                            void api
                              .runIndexer(c.id)
                              .then((r) => {
                                flash(
                                  (r as { message?: string }).message ||
                                    "Index job accepted. Opening Jobs tab…",
                                );
                                onGoJobs();
                              })
                              .catch((e) => flash(e.message, "err"));
                          }}
                        >
                          Run
                        </button>
                        <button
                          type="button"
                          className="btn danger"
                          onClick={() =>
                            void api
                              .deleteIndexerConfig(c.id)
                              .then(async () => {
                                flash("Deleted.");
                                await onRefresh();
                              })
                              .catch((e) => flash(e.message, "err"))
                          }
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      {editTarget && (
        <Drawer
          title={`Edit file config — ${editTarget.name}`}
          onClose={() => setEditTarget(null)}
        >
          <div className="grid-2">
            <div className="field">
              <label>Name</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="field">
              <label>Target index name</label>
              <input
                value={editIndexName}
                onChange={(e) => setEditIndexName(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Input path</label>
              <input
                value={editInputPath}
                onChange={(e) => setEditInputPath(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Batch size</label>
              <input
                type="number"
                value={editBatchSize}
                onChange={(e) => setEditBatchSize(e.target.value)}
                placeholder="optional"
              />
            </div>
            <div className="field">
              <label>Indexer instance</label>
              <select
                value={editInstanceId}
                onChange={(e) => setEditInstanceId(e.target.value)}
              >
                <option value="">Not assigned</option>
                {indexers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.enabled ? s.name : `${s.name} (disabled)`}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Engine instance</label>
              <select
                value={editEngineInstanceId}
                onChange={(e) => setEditEngineInstanceId(e.target.value)}
              >
                <option value="">Not assigned</option>
                {engines.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.enabled ? s.name : `${s.name} (disabled)`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                void api
                  .updateIndexerConfig(editTarget.id, {
                    name: editName,
                    indexName: editIndexName,
                    inputPath: editInputPath || undefined,
                    instanceId: editInstanceId || undefined,
                    engineInstanceId: editEngineInstanceId || undefined,
                    batchSize: editBatchSize ? parseInt(editBatchSize, 10) : undefined,
                  })
                  .then(async (r) => {
                    flash((r as { message?: string }).message ?? "Saved.");
                    setEditTarget(null);
                    await onRefresh();
                  })
                  .catch((e) => flash(e.message, "err"));
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setEditTarget(null)}
            >
              Cancel
            </button>
          </div>
        </Drawer>
      )}
    </>
  );
}

// ─── AuditPanel ───────────────────────────────────────────────────────────────

function AuditPanel({
  entries,
  total,
  from,
  pageSize,
  onPage,
}: {
  entries: AuditEntry[];
  total: number;
  from: number;
  pageSize: number;
  onPage: (next: number) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Audit log</h2>
      </div>
      {entries.length === 0 ? (
        <p className="hint">No audit entries.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Detail</th>
              <th>OK</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.at).toLocaleString()}</td>
                <td>{e.actorName ?? "—"}</td>
                <td>{e.action}</td>
                <td>{e.target ?? "—"}</td>
                <td>{e.detail ?? "—"}</td>
                <td>
                  <span className={`badge ${e.ok ? "ok" : "err"}`}>
                    {e.ok ? "yes" : "no"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager from={from} size={pageSize} total={total} onChange={onPage} />
    </section>
  );
}

// ─── UsersPanel ───────────────────────────────────────────────────────────────

function UsersPanel({
  users,
  total,
  from,
  pageSize,
  onPage,
  onRefresh,
  flash,
}: {
  users: HubUser[];
  total: number;
  from: number;
  pageSize: number;
  onPage: (next: number) => void;
  onRefresh: () => Promise<unknown> | unknown;
  flash: (m: string, t?: "ok" | "err") => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("operator");

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Create user</h2>
        </div>
        <p className="hint">
          RBAC roles: <strong>admin</strong> (full access), <strong>operator</strong>{" "}
          (manage indexes &amp; jobs), <strong>viewer</strong> (read &amp; search only).
        </p>
        <div className="grid-3">
          <div className="field">
            <label>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="admin">admin</option>
              <option value="operator">operator</option>
              <option value="viewer">viewer</option>
            </select>
          </div>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void api
              .createUser({ username, password, role })
              .then(async (r) => {
                flash((r as { message: string }).message);
                setUsername("");
                setPassword("");
                await onRefresh();
              })
              .catch((e) => flash(e.message, "err"))
          }
        >
          Create user
        </button>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Users</h2>
        </div>
        {users.length === 0 ? (
          <p className="hint">No users found.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>
                    <span className={`badge role-${u.role}`}>{u.role}</span>
                  </td>
                  <td>{new Date(u.createdAt).toLocaleString()}</td>
                  <td>
                    <button
                      type="button"
                      className="btn danger"
                      aria-label={`Delete user ${u.username}`}
                      onClick={() =>
                        void api
                          .deleteUser(u.id)
                          .then(async () => {
                            flash("User removed.");
                            await onRefresh();
                          })
                          .catch((e) => flash(e.message, "err"))
                      }
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pager from={from} size={pageSize} total={total} onChange={onPage} />
      </section>
    </>
  );
}
