import { useEffect, useMemo, useState } from "react";
import { api, type AuditEntry, type FleetHealthRow, type HubInstance, type HubJob } from "../api";

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

export function DashboardPanel({
  engines,
  instances,
  jobs,
  auditEntries,
  onNavigate,
  engineId,
  indexCount,
}: {
  engines: HubInstance[];
  spiders: HubInstance[];
  indexers: HubInstance[];
  instances: HubInstance[];
  jobs: HubJob[];
  auditEntries: AuditEntry[];
  onNavigate: (tab: Tab) => void;
  engineId: string;
  indexCount: number;
}) {
  const [fleet, setFleet] = useState<FleetHealthRow[]>([]);
  const [fleetMsg, setFleetMsg] = useState("Checking cluster fleet…");
  const [checking, setChecking] = useState(false);
  const [deadLetterCount, setDeadLetterCount] = useState<number>(0);

  const running = useMemo(
    () => jobs.filter((j) => j.status === "running" || j.status === "queued"),
    [jobs],
  );
  const failed = useMemo(() => jobs.filter((j) => j.status === "failed").slice(0, 5), [jobs]);
  const online = fleet.filter((f) => f.ok).length;

  async function checkFleet() {
    setChecking(true);
    try {
      const r = await api.fleetHealth();
      setFleet(r.results);
      setFleetMsg(r.message);
      const dl = await api.listDeadLetter(undefined, undefined, 1);
      setDeadLetterCount(dl.total ?? 0);
    } catch (e) {
      setFleetMsg(e instanceof Error ? e.message : "Fleet check failed");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void checkFleet();
    const t = setInterval(() => void checkFleet(), 15000);
    return () => clearInterval(t);
  }, [instances.length]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Metrics Row */}
      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Fleet Status</p>
          <p className="stat-value" style={{ color: online === fleet.length && fleet.length > 0 ? "var(--status-ok)" : "var(--signal-gold)" }}>
            {online} / {fleet.length || instances.length}
          </p>
          <p className="stat-detail">Active Nodes Reachable</p>
        </div>

        <div className="stat-card">
          <p className="stat-label">Active Engine Indexes</p>
          <p className="stat-value" style={{ color: "var(--cobalt-bright)" }}>
            {indexCount}
          </p>
          <p className="stat-detail">Configured Indexes</p>
        </div>

        <div className="stat-card">
          <p className="stat-label">Active Job Queue</p>
          <p className="stat-value" style={{ color: running.length > 0 ? "var(--signal-gold)" : "var(--text-muted)" }}>
            {running.length}
          </p>
          <p className="stat-detail">Running / Queued Tasks</p>
        </div>

        <div className="stat-card">
          <p className="stat-label">Dead-Letter Queue</p>
          <p className="stat-value" style={{ color: deadLetterCount > 0 ? "var(--signal-gold)" : "var(--status-ok)" }}>
            {deadLetterCount}
          </p>
          <p className="stat-detail">Isolated for Replay</p>
        </div>

        <div className="stat-card">
          <p className="stat-label">Recent Failures</p>
          <p className="stat-value" style={{ color: failed.length > 0 ? "var(--status-err)" : "var(--status-ok)" }}>
            {failed.length}
          </p>
          <p className="stat-detail">Job Errors Logged</p>
        </div>
      </div>

      {/* Cluster Node Health Cards */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Cluster Node Health</h2>
            <p className="hint" style={{ margin: 0 }}>{fleetMsg}</p>
          </div>
          <button
            type="button"
            className="btn secondary"
            disabled={checking}
            onClick={() => void checkFleet()}
          >
            {checking ? "Checking…" : "↻ Recheck Nodes"}
          </button>
        </div>

        {fleet.length === 0 ? (
          <p className="hint">No registered nodes found. Add nodes under Instances.</p>
        ) : (
          <div className="grid-3" style={{ marginTop: "1rem" }}>
            {fleet.map((f) => (
              <div
                key={f.id}
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "1.25rem",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "1rem",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <strong style={{ fontSize: "1rem", color: "#ffffff" }}>{f.name}</strong>
                    <span className={`badge ${f.ok ? "ok" : "err"}`}>
                      {f.ok ? "online" : "offline"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <span className="badge" style={{ color: "var(--cobalt-bright)", borderColor: "var(--border)" }}>{f.kind}</span>
                    {f.latencyMs != null && (
                      <span className="badge" style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                        ⚡ {f.latencyMs} ms
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-subtle)", fontFamily: "var(--font-mono)", margin: 0 }}>
                    {f.baseUrl}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem", width: "100%" }}
                  onClick={() => onNavigate("instances")}
                >
                  Manage Node →
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quick Launch Action Cards */}
      <section className="panel">
        <div className="panel-head">
          <h2>Quick Actions</h2>
        </div>
        <div className="grid-4">
          <div
            className="stat-card"
            style={{ cursor: "pointer" }}
            onClick={() => onNavigate("search")}
          >
            <p className="font-label" style={{ color: "var(--cobalt-bright)" }}>Search Studio</p>
            <h3 style={{ marginTop: "0.5rem" }}>Hybrid Search</h3>
            <p style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>Run phrase, fuzzy, BM25, and semantic queries.</p>
          </div>

          <div
            className="stat-card"
            style={{ cursor: "pointer" }}
            onClick={() => onNavigate("spider")}
          >
            <p className="font-label" style={{ color: "var(--signal-gold)" }}>Web Crawler</p>
            <h3 style={{ marginTop: "0.5rem" }}>Run Spider</h3>
            <p style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>Crawl sitemaps and auto-index websites.</p>
          </div>

          <div
            className="stat-card"
            style={{ cursor: "pointer" }}
            onClick={() => onNavigate("indexes")}
          >
            <p className="font-label" style={{ color: "var(--status-ok)" }}>Index Manager</p>
            <h3 style={{ marginTop: "0.5rem" }}>Create Index</h3>
            <p style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>Build custom field schemas & vector settings.</p>
          </div>

          <div
            className="stat-card"
            style={{ cursor: "pointer" }}
            onClick={() => onNavigate("indexer")}
          >
            <p className="font-label" style={{ color: "var(--text-muted)" }}>Data Pipeline</p>
            <h3 style={{ marginTop: "0.5rem" }}>Bulk Ingestion</h3>
            <p style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>Import JSON payloads or NDJSON stream files.</p>
          </div>
        </div>
      </section>

      {/* Recent Activity Cards Grid */}
      <div className="grid-2">
        {/* Recent Jobs Card */}
        <section className="panel" style={{ margin: 0 }}>
          <div className="panel-head">
            <h2>Recent Job Queue</h2>
            <button type="button" className="btn ghost" onClick={() => onNavigate("jobs")}>
              View All →
            </button>
          </div>
          {jobs.length === 0 ? (
            <p className="hint">No background jobs executed yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {jobs.slice(0, 5).map((j) => (
                <div
                  key={j.id}
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.75rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span className="badge" style={{ color: "var(--cobalt-bright)" }}>{j.kind}</span>
                      <strong style={{ fontSize: "0.88rem", color: "#ffffff" }}>{j.configName || j.id}</strong>
                    </div>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-subtle)", margin: "0.2rem 0 0 0" }}>
                      {j.message}
                    </p>
                  </div>
                  <span className={`badge ${j.status === "completed" ? "ok" : j.status === "failed" ? "err" : "warn"}`}>
                    {j.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Security Audit Card */}
        <section className="panel" style={{ margin: 0 }}>
          <div className="panel-head">
            <h2>Audit Trail</h2>
            <button type="button" className="btn ghost" onClick={() => onNavigate("audit")}>
              View All →
            </button>
          </div>
          {auditEntries.length === 0 ? (
            <p className="hint">No audit entries logged.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {auditEntries.slice(0, 5).map((e) => (
                <div
                  key={e.id}
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.75rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span className="badge" style={{ color: "var(--signal-gold)" }}>{e.action}</span>
                      <strong style={{ fontSize: "0.88rem", color: "#ffffff" }}>{e.actorName || "system"}</strong>
                    </div>
                    <p style={{ fontSize: "0.78rem", color: "var(--text-subtle)", fontFamily: "var(--font-mono)", margin: "0.2rem 0 0 0" }}>
                      {new Date(e.at).toLocaleString()}
                    </p>
                  </div>
                  <span className={`badge ${e.ok ? "ok" : "err"}`}>
                    {e.ok ? "success" : "failed"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
