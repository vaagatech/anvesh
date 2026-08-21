import {
  cognitoLogin,
  cognitoRegister,
  cognitoConfirmRegister,
  cognitoForgotPassword,
  cognitoConfirmForgotPassword,
  cognitoChangePassword,
  isCognitoConfigured,
  extractUserClaims,
} from "./cognito";
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
import { ObservabilityPanel } from "./panels/Observability";
import { InstancesPanel } from "./panels/Instances";
import { IndexesPanel } from "./panels/Indexes";
import { DocumentsPanel } from "./panels/Documents";
import { SearchPanel } from "./panels/Search";
import { SpiderPanel } from "./panels/Spider";
import { IndexerPanel } from "./panels/Indexer";
import { JobsPanel } from "./panels/Jobs";
import { AuditPanel } from "./panels/Audit";
import { UsersPanel } from "./panels/Users";
import { DeadLetterPanel } from "./panels/DeadLetter";

type Tab =
  | "dashboard"
  | "observability"
  | "instances"
  | "indexes"
  | "documents"
  | "search"
  | "spider"
  | "indexer"
  | "jobs"
  | "deadletter"
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

type AuthMode = "login" | "register" | "confirm-register" | "forgot" | "confirm-forgot";

export function App() {
  const [user, setUser] = useState<HubUser | null>(null);

  const location = useLocation();
  const navigate = useNavigate();
  const tab = (location.pathname.slice(1) || "dashboard") as Tab;

  const setTab = (newTab: Tab) => {
    navigate(`/${newTab}`);
  };

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [status, setStatus] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "err" | "warn" | "">("");
  const [pending, start] = useTransition();

  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

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
    () => (instances || []).filter((i) => i && HUB_SEARCH_INSTANCE_KINDS.includes(i.kind)),
    [instances],
  );
  const spiders = useMemo(() => (instances || []).filter((i) => i && i.kind === "spider"), [instances]);
  const indexers = useMemo(() => (instances || []).filter((i) => i && i.kind === "indexer"), [instances]);

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("anvesh-theme") as "light" | "dark") || "light";
    }
    return "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("anvesh-theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }

  function flash(msg: string, t: "ok" | "err" | "warn" = "ok") {
    let cleanMsg = msg;
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      cleanMsg = "Network / Gateway unreachable. Check your internet connection or verify worker cluster status.";
    }
    setStatus(cleanMsg);
    setTone(t);
    setTimeout(() => {
      setStatus((current) => (current === cleanMsg ? null : current));
    }, t === "err" ? 8000 : 4000);
  }

  async function refreshAll() {
    try {
      const inst = await api.listInstances();
      const list = Array.isArray(inst?.instances) ? inst.instances : (Array.isArray(inst) ? (inst as any) : []);
      setInstances(list);
      if (!engineId && list.length > 0) {
        const eng = list.find((i: any) => i && HUB_SEARCH_INSTANCE_KINDS.includes(i.kind));
        if (eng) setEngineId(eng.id);
      }
    } catch (e: any) {
      console.warn("Failed to list instances:", e);
      setInstances([]);
    }
  }

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setToken(null);
      flash("Session expired or unauthorized. Please sign in.", "err");
    };
    window.addEventListener("anvesh:unauthorized", onUnauthorized);

    const token = getToken();
    if (!token) return () => window.removeEventListener("anvesh:unauthorized", onUnauthorized);
    api
      .me()
      .then(async (r) => {
        setUser(r.user);
        await refreshAll();
      })
      .catch(() => {
        setUser(null);
        setToken(null);
      });

    return () => window.removeEventListener("anvesh:unauthorized", onUnauthorized);
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
        .then((r) => setSpiderConfigs(r.configs ?? []))
        .catch((e) => flash(e.message, "err"));
    }
    if (tab === "indexer") {
      api
        .listIndexerConfigs()
        .then((r) => setIndexerConfigs(r.configs ?? []))
        .catch((e) => flash(e.message, "err"));
    }
    if (tab === "users" && user.role === "admin") {
      api
        .listUsers(usersFrom, usersPageSize)
        .then((r) => {
          setUsers(r.users ?? []);
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

  // ── Cognito Authentication Card ─────────────────────────────────────────────

  if (!user) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <p className="eyebrow">VaagaTech Identity</p>
          <h1>Anvesh Hub</h1>
          <p className="hint">
            {authMode === "login" && "Sign in with your Cognito account."}
            {authMode === "register" && "Create a new account on Anvesh platform."}
            {authMode === "confirm-register" && "Enter the verification code sent to your email."}
            {authMode === "forgot" && "Reset your password via verified email."}
            {authMode === "confirm-forgot" && "Set a new password using your reset code."}
          </p>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${authMode === "login" ? "active" : ""}`}
              onClick={() => { setAuthMode("login"); setStatus(null); }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-tab ${authMode === "register" || authMode === "confirm-register" ? "active" : ""}`}
              onClick={() => { setAuthMode("register"); setStatus(null); }}
            >
              Register
            </button>
            <button
              type="button"
              className={`auth-tab ${authMode === "forgot" || authMode === "confirm-forgot" ? "active" : ""}`}
              onClick={() => { setAuthMode("forgot"); setStatus(null); }}
            >
              Reset
            </button>
          </div>

          {/* 1. SIGN IN FORM */}
          {authMode === "login" && (
            <form
              id="login"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  try {
                    if (isCognitoConfigured()) {
                      const tokens = await cognitoLogin(username, password);
                      setToken(tokens.idToken);
                      localStorage.setItem("anvesh.hub.id_token", tokens.idToken);
                      const claims = extractUserClaims(tokens.idToken, tokens.accessToken);
                      setUser({
                        id: claims.sub,
                        username: claims.username,
                        role: claims.role,
                        createdAt: new Date().toISOString(),
                      });
                      flash(`Welcome back, ${claims.username}! Role: ${claims.role}`);
                    } else {
                      const res = await api.login(username, password);
                      setToken(res.token);
                      setUser(res.user);
                      flash(res.message);
                    }
                    await refreshAll();
                  } catch (err) {
                    flash(err instanceof Error ? err.message : "Login failed", "err");
                  }
                });
              }}
            >
              <div className="field">
                <label htmlFor="hub-user">Username or Email</label>
                <input
                  id="hub-user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  placeholder="admin@vaagatech.com"
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
                  required
                  placeholder="••••••••"
                />
              </div>
              <button className="btn" type="submit" disabled={pending}>
                {pending ? "Authenticating…" : "Sign In"}
              </button>
              <div className="auth-switch">
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => { setAuthMode("forgot"); setStatus(null); }}
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => { setAuthMode("register"); setStatus(null); }}
                >
                  Create account
                </button>
              </div>
            </form>
          )}

          {/* 2. REGISTER FORM */}
          {authMode === "register" && (
            <form
              id="register"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  try {
                    const res = await cognitoRegister(username, password, email);
                    if (res.userConfirmed) {
                      const tokens = await cognitoLogin(username, password);
                      setToken(tokens.idToken);
                      localStorage.setItem("anvesh.hub.id_token", tokens.idToken);
                      const claims = extractUserClaims(tokens.idToken, tokens.accessToken);
                      setUser({
                        id: claims.sub,
                        username: claims.username,
                        role: claims.role,
                        createdAt: new Date().toISOString(),
                      });
                      flash(`Account created! Welcome, ${claims.username}`);
                      await refreshAll();
                    } else {
                      setAuthMode("confirm-register");
                      flash("Verification code sent to your email! Please enter it below.");
                    }
                  } catch (err) {
                    flash(err instanceof Error ? err.message : "Registration failed", "err");
                  }
                });
              }}
            >
              <div className="field">
                <label htmlFor="reg-user">Username</label>
                <input
                  id="reg-user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  placeholder="Choose a username"
                />
              </div>
              <div className="field">
                <label htmlFor="reg-email">Email Address</label>
                <input
                  id="reg-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  placeholder="name@company.com"
                />
              </div>
              <div className="field">
                <label htmlFor="reg-pass">Password (Min 8 chars, 1 uppercase, 1 number)</label>
                <input
                  id="reg-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  placeholder="••••••••"
                />
              </div>
              <button className="btn" type="submit" disabled={pending}>
                {pending ? "Creating Account…" : "Register Account"}
              </button>
              <div className="auth-switch" style={{ justifyContent: "center" }}>
                <span className="hint" style={{ marginRight: "0.5rem" }}>Already registered?</span>
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => { setAuthMode("login"); setStatus(null); }}
                >
                  Sign In
                </button>
              </div>
            </form>
          )}

          {/* 3. CONFIRM REGISTRATION FORM */}
          {authMode === "confirm-register" && (
            <form
              id="confirm-register"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  try {
                    await cognitoConfirmRegister(username, confirmCode);
                    flash("Email verified successfully! Signing you in…");
                    const tokens = await cognitoLogin(username, password);
                    setToken(tokens.idToken);
                    localStorage.setItem("anvesh.hub.id_token", tokens.idToken);
                    const claims = extractUserClaims(tokens.idToken, tokens.accessToken);
                    setUser({
                      id: claims.sub,
                      username: claims.username,
                      role: claims.role,
                      createdAt: new Date().toISOString(),
                    });
                    await refreshAll();
                  } catch (err) {
                    flash(err instanceof Error ? err.message : "Verification failed", "err");
                  }
                });
              }}
            >
              <div className="field">
                <label htmlFor="conf-code">Verification Code</label>
                <input
                  id="conf-code"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  placeholder="6-digit code from email"
                  required
                />
              </div>
              <button className="btn" type="submit" disabled={pending}>
                {pending ? "Verifying…" : "Confirm & Sign In"}
              </button>
              <div className="auth-switch" style={{ justifyContent: "center" }}>
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => { setAuthMode("login"); setStatus(null); }}
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* 4. FORGOT PASSWORD (REQUEST CODE) */}
          {authMode === "forgot" && (
            <form
              id="forgot"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  try {
                    await cognitoForgotPassword(username);
                    setAuthMode("confirm-forgot");
                    flash("Password reset code sent to your email!");
                  } catch (err) {
                    flash(err instanceof Error ? err.message : "Request failed", "err");
                  }
                });
              }}
            >
              <div className="field">
                <label htmlFor="forgot-user">Username or Email</label>
                <input
                  id="forgot-user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  placeholder="Enter your username"
                />
              </div>
              <button className="btn" type="submit" disabled={pending}>
                {pending ? "Sending Code…" : "Send Reset Code"}
              </button>
              <div className="auth-switch" style={{ justifyContent: "center" }}>
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => { setAuthMode("login"); setStatus(null); }}
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* 5. CONFIRM FORGOT PASSWORD (SET NEW PASSWORD) */}
          {authMode === "confirm-forgot" && (
            <form
              id="confirm-forgot"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  try {
                    await cognitoConfirmForgotPassword(username, confirmCode, newPassword);
                    setAuthMode("login");
                    setPassword(newPassword);
                    flash("Password reset successfully! Please sign in with your new password.");
                  } catch (err) {
                    flash(err instanceof Error ? err.message : "Password reset failed", "err");
                  }
                });
              }}
            >
              <div className="field">
                <label htmlFor="reset-code">Reset Code</label>
                <input
                  id="reset-code"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  placeholder="Code from email"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="reset-new-pass">New Password</label>
                <input
                  id="reset-new-pass"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                />
              </div>
              <button className="btn" type="submit" disabled={pending}>
                {pending ? "Resetting Password…" : "Update Password"}
              </button>
              <div className="auth-switch" style={{ justifyContent: "center" }}>
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => { setAuthMode("login"); setStatus(null); }}
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}

          {status && (
            <p className={`banner ${tone}`} style={{ marginTop: "1rem" }}>
              {status}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Left Sidebar Navigation Groups ──────────────────────────────────────────

  const navGroups: {
    label: string;
    items: { id: Tab; label: string; show?: boolean }[];
  }[] = [
    {
      label: "Overview",
      items: [
        { id: "dashboard", label: "Dashboard" },
        { id: "observability", label: "Observability & Metrics" },
      ],
    },
    {
      label: "Operate",
      items: [
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
        { id: "jobs", label: "Job Queue" },
        { id: "deadletter", label: "Dead-Letter Queue", show: user.role !== "viewer" },
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
    observability: "Observability & Live Metrics",
    instances: "Instances",
    indexes: "Indexes",
    documents: "Documents",
    search: "Search Studio",
    spider: "Web Crawler",
    indexer: "Bulk Import",
    jobs: "Job Queue",
    deadletter: "Dead-Letter Queue & Replay",
    audit: "Audit Logs",
    users: "User Administration",
  };

  const ledes: Partial<Record<Tab, string>> = {
    dashboard: "Cluster node status, worker fleet, and operational checklist",
    observability: "Real-time query latency percentiles, memory efficiency, and distributed telemetry",
    instances: "Manage registered Engine, Spider, and Indexer instances",
    indexes: "Create and inspect search indexes, mappings, and snapshots",
    documents: "Ingest and inspect documents within the active index",
    search: "Hybrid BM25 and dense vector search playground",
    spider: "Automated web crawler with role authentication & auto-indexing",
    indexer: "Bulk ingestion worker configurations & HTTP streams",
    jobs: "Background crawl and indexing job execution history & logs",
    deadletter: "Inspect isolated record failures and replay directly into the search engine",
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
          { id: "observability", label: "Observability & Metrics", group: "Overview", hint: "Real-time QPS & latency" },
          { id: "instances", label: "Instances", group: "Operate", hint: "Manage engine workers" },
          { id: "indexes", label: "Indexes", group: "Operate", hint: "Create/inspect indexes" },
          { id: "documents", label: "Documents", group: "Operate", hint: "Browse and ingest JSON" },
          { id: "search", label: "Search Studio", group: "Operate", hint: "Hybrid & vector search" },
          { id: "spider", label: "Web Crawler", group: "Pipeline", hint: "Crawl web pages" },
          { id: "indexer", label: "Bulk Import", group: "Pipeline", hint: "Ingest JSON data" },
          { id: "jobs", label: "Job Queue", group: "Pipeline", hint: "Crawl & index logs" },
          { id: "deadletter", label: "Dead-Letter Queue", group: "Pipeline", hint: "Inspect & replay failed records" },
          { id: "audit", label: "Audit Logs", group: "Admin", hint: "View security audit logs" },
          { id: "users", label: "Users", group: "Admin", hint: "RBAC account management" },
        ]}
      />

      {/* Floating Toast Notification */}
      {status && (
        <div className="toast-container">
          <div className={`toast ${tone}`} role="status">
            <span className="toast-icon">
              {tone === "err" ? "⚠️" : tone === "warn" ? "⚡" : "✓"}
            </span>
            <span className="toast-msg">{status}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => setStatus(null)}
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="shell">
        {/* Left Sidebar Navigation */}
        <aside className={`nav-sidebar${mobileNavOpen ? " mobile-open" : ""}`} aria-label="Hub Navigation">
          <div className="nav-brand">
            <div className="brand-mark">
              <img src="/favicon.svg" alt="Anvesh" />
            </div>
            <span className="brand-title">Anvesh</span>
            <span className="brand-badge">{user.role}</span>
          </div>

          <div className="nav-cluster">
            {navGroups.map((group) => {
              const visible = group.items.filter((n) => n.show !== false);
              if (visible.length === 0) return null;
              return (
                <div key={group.label}>
                  <p className="nav-section-title">{group.label}</p>
                  <ul className="nav-menu">
                    {visible.map((n) => (
                      <li key={n.id}>
                        <NavLink
                          to={`/${n.id}`}
                          className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
                          onClick={() => setMobileNavOpen(false)}
                        >
                          <span>{n.label}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="nav-footer">
            <div className="nav-footer-links">
              <a href="https://vaagatech.github.io/anvesh/" target="_blank" rel="noopener noreferrer">Docs ↗</a>
              <a href="https://github.com/vaagatech/anvesh" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
            </div>
            <span>© 2026 VaagaTech</span>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="main-wrap" id="main">
          {/* Top Header Bar */}
          <header className="topbar">
            <div className="topbar-left">
              <div>
                <h1 className="topbar-title">{tabLabels[tab]}</h1>
              </div>
            </div>

            <div className="topbar-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setCmdOpen(true)}
                title="Open Command Palette (Cmd+K)"
              >
                🔍 Search Menu <kbd style={{ marginLeft: "4px", opacity: 0.7 }}>⌘K</kbd>
              </button>

              <button
                type="button"
                className="theme-btn"
                onClick={toggleTheme}
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                aria-label="Toggle theme"
              >
                {theme === 'light' ? '🌙' : '☀️'}
              </button>

              <div className="user-badge">
                <span>{user.username}</span>
                <span className="user-role-badge">{user.role}</span>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setChangePasswordOpen(true)}
                title="Change Cognito Password"
              >
                Password
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  start(async () => {
                    await api.logout().catch(() => undefined);
                    setToken(null);
                    localStorage.removeItem("anvesh.hub.id_token");
                    setUser(null);
                  })
                }
              >
                Sign Out
              </button>
            </div>
          </header>

          <main className="content-body">
            {ledes[tab] && (
              <p className="lede" style={{ marginBottom: "1.25rem" }}>
                {ledes[tab]}
              </p>
            )}

            {/* Sync Context Bar - only on tabs that inspect or query active indexes */}
            {(tab === "indexes" || tab === "documents" || tab === "search") && (
              <div className="context-bar">
                <div className="field">
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
                <div className="field">
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
                  Context synced across Search Studio and Documents.
                </p>
              </div>
            )}

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

            {tab === "observability" && (
              <ObservabilityPanel
                engines={engines}
                instances={instances}
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

            {tab === "deadletter" && (
              <DeadLetterPanel
                engines={engines}
                engineId={engineId}
                setEngineId={setEngineId}
                indexes={indexes}
                indexName={indexName}
                setIndexName={setIndexName}
                flash={flash}
              />
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
      </div>
        
          {/* Change Password Dialog */}
          {changePasswordOpen && (
            <>
              <div className="modal-backdrop" onClick={() => setChangePasswordOpen(false)} />
              <div className="modal-dialog" role="dialog" aria-modal="true" style={{ maxWidth: "450px" }}>
                <h2>Change Password</h2>
                <p className="hint">Update your AWS Cognito account password.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    start(async () => {
                      try {
                        const token = getToken();
                        if (isCognitoConfigured() && token) {
                          await cognitoChangePassword(token, oldPassword, newPassword);
                          flash("Password changed successfully in Cognito!");
                        } else {
                          const res = await api.changePassword(oldPassword, newPassword);
                          flash(res.message);
                        }
                        setChangePasswordOpen(false);
                        setOldPassword("");
                        setNewPassword("");
                      } catch (err) {
                        flash(err instanceof Error ? err.message : "Password change failed", "err");
                      }
                    });
                  }}
                >
                  <div className="field">
                    <label htmlFor="modal-old-pass">Current Password</label>
                    <input
                      id="modal-old-pass"
                      type="password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="modal-new-pass">New Password</label>
                    <input
                      id="modal-new-pass"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
                    <button className="btn" type="submit" disabled={pending} style={{ flex: 1 }}>
                      {pending ? "Updating…" : "Update Password"}
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setChangePasswordOpen(false)}
                      style={{ flex: 1 }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}
    </>
  );
}
