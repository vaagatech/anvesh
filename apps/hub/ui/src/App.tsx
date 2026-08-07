import React, { useEffect, useMemo, useState, useTransition } from "react";
import { useNavigate, useLocation, NavLink } from "react-router-dom";
import {
  api,
  getToken,
  setToken,
  HUB_SEARCH_INSTANCE_KINDS,
  type HubUser,
  type HubInstance,
  type IndexInfo,
  type SpiderConfigRow,
  type IndexerConfigRow,
  type HubJob,
  type AuditEntry,
} from "./api";
import { DashboardPanel } from "./panels/Dashboard";
import { InstancesPanel } from "./panels/Instances";
import { IndexesPanel } from "./panels/Indexes";
import { DocumentsPanel } from "./panels/Documents";
import { SearchPanel } from "./panels/Search";
import { SpiderPanel } from "./panels/Spider";
import { IndexerPanel } from "./panels/Indexer";
import { JobsPanel } from "./panels/Jobs";
import { AuditPanel } from "./panels/Audit";
import { UsersPanel } from "./panels/Users";

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
  | "users";

// ─── CommandPalette ──────────────────────────────────────────────────────────

function CommandPalette({
  open,
  onClose,
  onSelectTab,
  tabs,
}: {
  open: boolean;
  onClose: () => void;
  onSelectTab: (t: Tab) => void;
  tabs: Array<{ id: Tab; label: string; group: string; hint?: string }>;
}) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    if (!search.trim()) return tabs;
    const q = search.toLowerCase();
    return tabs.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.group.toLowerCase().includes(q) ||
        (t.hint && t.hint.toLowerCase().includes(q)),
    );
  }, [search, tabs]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      }
      if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        onSelectTab(filtered[selectedIndex].id);
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, onSelectTab, filtered, selectedIndex]);

  if (!open) return null;

  return (
    <>
      <div className="cmd-palette-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="cmd-palette-dialog" role="dialog" aria-modal="true" aria-label="Command Palette">
        <input
          type="text"
          className="cmd-search-input"
          placeholder="Type a command or tab name... (Esc to cancel)"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="cmd-list" style={{ marginTop: "1rem", maxHeight: "300px", overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "1rem", color: "var(--text-muted)" }}>No matching commands.</div>
          ) : (
            filtered.map((t, idx) => (
              <button
                key={t.id}
                type="button"
                className={`cmd-item${idx === selectedIndex ? " selected" : ""}`}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.75rem",
                  background: idx === selectedIndex ? "rgba(96, 165, 250, 0.15)" : "transparent",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-ink)",
                  cursor: "pointer",
                  textAlign: "left",
                  marginBottom: "0.25rem",
                }}
                onClick={() => {
                  onSelectTab(t.id);
                  onClose();
                }}
              >
                <div>
                  <strong>{t.label}</strong>
                  {t.hint && (
                    <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      — {t.hint}
                    </span>
                  )}
                </div>
                <span className="cmd-kbd">{t.group}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main App Component ───────────────────────────────────────────────────────

export function App() {
  const [user, setUser] = useState<HubUser | null>(null);

  const location = useLocation();
  const navigate = useNavigate();
  const tab = (location.pathname.slice(1) || "dashboard") as Tab;

  const setTab = (newTab: Tab) => {
    navigate(`/${newTab}`);
  };

  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<"ok" | "err" | "">("");
  const [pending, start] = useTransition();

  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const [instances, setInstances] = useState<HubInstance[]>([]);
  const [engineId, setEngineId] = useState("");
  const [indexName, setIndexName] = useState("");
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [spiderConfigs, setSpiderConfigs] = useState<SpiderConfigRow[]>([]);
  const [indexerConfigs, setIndexerConfigs] = useState<IndexerConfigRow[]>([]);
  const [users, setUsers] = useState<HubUser[]>([]);
  const [jobs, setJobs] = useState<HubJob[]>([]);
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
          setAuditEntries(a.entries);
          setAuditTotal(a.total);
        })
        .catch(() => undefined);
    }
  }, [user, tab, auditFrom, usersFrom]);

  // ── Login Card ─────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <div className="login-wrap">
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
          <h1>Anvesh Hub</h1>
          <p className="hint">Control plane for Anvesh search, crawler, and indexing engine.</p>
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
            {pending ? "Signing in…" : "Sign In"}
          </button>
          {status && (
            <p className={`banner ${tone}`} style={{ marginTop: "1rem" }}>
              {status}
            </p>
          )}
        </form>
      </div>
    );
  }

  // ── Left Sidebar Navigation Groups ──────────────────────────────────────────

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
        { id: "search", label: "Search Studio" },
      ],
    },
    {
      label: "Pipeline",
      items: [
        { id: "spider", label: "Web Crawler", show: user.role !== "viewer" },
        { id: "indexer", label: "Bulk Import", show: user.role !== "viewer" },
        { id: "jobs", label: "Jobs Queue" },
      ],
    },
    {
      label: "Admin",
      items: [
        { id: "audit", label: "Audit Logs" },
        { id: "users", label: "Users", show: user.role === "admin" },
      ],
    },
  ];

  const tabLabels: Record<Tab, string> = {
    dashboard: "Dashboard",
    instances: "Instances",
    indexes: "Indexes",
    documents: "Documents",
    search: "Search Studio",
    spider: "Web Crawler",
    indexer: "Bulk Import",
    jobs: "Job Queue",
    audit: "Audit Logs",
    users: "User Administration",
  };

  const ledes: Partial<Record<Tab, string>> = {
    dashboard: "Cluster node status, live metrics, and setup status",
    instances: "Manage registered Engine, Spider, and Indexer instances",
    indexes: "Create and inspect search indexes and mappings",
    documents: "Ingest and inspect documents within the active index",
    search: "Hybrid BM25 and vector search playground",
    spider: "Automated web crawler with role authentication & auto-indexing",
    indexer: "Bulk ingestion worker configurations & HTTP streams",
    jobs: "Background crawl and indexing job execution history & logs",
    audit: "Security and operation audit trail",
    users: "Role-based access control user management",
  };

  return (
    <>
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onSelectTab={(t) => setTab(t)}
        tabs={[
          { id: "dashboard", label: "Dashboard", group: "Overview", hint: "Fleet health & checklist" },
          { id: "instances", label: "Instances", group: "Operate", hint: "Manage engine workers" },
          { id: "indexes", label: "Indexes", group: "Operate", hint: "Create/inspect indexes" },
          { id: "documents", label: "Documents", group: "Operate", hint: "Browse and ingest JSON" },
          { id: "search", label: "Search Studio", group: "Operate", hint: "Hybrid & vector search" },
          { id: "spider", label: "Web Crawler", group: "Pipeline", hint: "Crawl web pages" },
          { id: "indexer", label: "Bulk Import", group: "Pipeline", hint: "Ingest JSON data" },
          { id: "jobs", label: "Job Queue", group: "Pipeline", hint: "Crawl & index logs" },
          { id: "audit", label: "Audit Logs", group: "Admin", hint: "View security audit logs" },
          { id: "users", label: "Users", group: "Admin", hint: "RBAC account management" },
        ]}
      />

      <div className="shell">
        {/* Left Sidebar Navigation */}
        <aside className={`nav${mobileNavOpen ? " mobile-open" : ""}`} aria-label="Hub Navigation">
          <div className="brand-container">
            <p className="brand">Anvesh</p>
            <p className="brand-sub">VaagaTech · {user.role}</p>
          </div>

          {navGroups.map((group) => {
            const visible = group.items.filter((n) => n.show !== false);
            if (visible.length === 0) return null;
            return (
              <div key={group.label} className="nav-group">
                <p className="nav-label">{group.label}</p>
                {visible.map((n) => (
                  <NavLink
                    key={n.id}
                    to={`/${n.id}`}
                    className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
                    onClick={() => setMobileNavOpen(false)}
                  >
                    {n.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </aside>

        {/* Main Content Area */}
        <main className="main" id="main">
          {/* Header Bar */}
          <div className="header-bar">
            <div className="header-title">
              <h1>{tabLabels[tab]}</h1>
              {ledes[tab] && <p className="lede">{ledes[tab]}</p>}
            </div>

            <div className="header-actions">
              <button
                type="button"
                className="cmd-trigger-btn"
                onClick={() => setCmdOpen(true)}
                title="Open Command Palette (Cmd+K)"
              >
                🔍 <span>Search Menu</span> <kbd className="cmd-kbd">⌘K</kbd>
              </button>

              <span className="user-profile-badge">
                {user.username}
                <span className={`role-pill ${user.role}`}>{user.role}</span>
              </span>

              <button
                type="button"
                className="btn secondary"
                style={{ padding: "0.4rem 0.85rem", fontSize: "0.85rem" }}
                onClick={() =>
                  start(async () => {
                    await api.logout().catch(() => undefined);
                    setToken(null);
                    setUser(null);
                  })
                }
              >
                Sign Out
              </button>
            </div>
          </div>

          {status && (
            <div className={`banner ${tone}`} role="status" aria-live="polite">
              {status}
            </div>
          )}

          {/* Sync Context Bar */}
          <div className="context-bar">
            <div className="field" style={{ margin: 0 }}>
              <label>Engine Node</label>
              <select
                value={engineId}
                onChange={(e) => setEngineId(e.target.value)}
                aria-label="Active engine node"
              >
                <option value="">Select Engine…</option>
                {engines.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.baseUrl})
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Target Index</label>
              <select
                value={indexName}
                onChange={(e) => setIndexName(e.target.value)}
                aria-label="Active target index"
              >
                <option value="">Select Index…</option>
                {indexes.map((i) => (
                  <option key={i.name} value={i.name}>
                    {i.name} ({i.docCount ?? 0} docs)
                  </option>
                ))}
              </select>
            </div>
            <p className="hint context-hint">
              Context synced across Search, Documents, and Web Crawler.
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
        </main>
      </div>
    </>
  );
}
