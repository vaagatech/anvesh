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
  | "users"
  | "appearance";

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
  const [fleetMsg, setFleetMsg] = useState("Checking fleet…");
  const [checking, setChecking] = useState(false);

  const running = useMemo(
    () => jobs.filter((j) => j.status === "running" || j.status === "queued"),
    [jobs],
  );
  const failed = useMemo(() => jobs.filter((j) => j.status === "failed").slice(0, 5), [jobs]);
  const online = fleet.filter((f) => f.ok).length;

  const enabledCore = fleet.filter(
    (f) => f.enabled && (f.kind === "engine" || f.kind === "spider" || f.kind === "indexer"),
  );
  const fleetHealthy =
    enabledCore.length >= 3 && enabledCore.every((f) => f.ok);
  const crawlDone = jobs.some((j) => j.kind === "spider" && j.status === "completed");

  const steps = [
    {
      done: fleetHealthy,
      title: "Fleet healthy",
      detail: "Engine, spider, and indexer reachable (auto-seeded after npm start)",
      tab: "instances" as Tab,
    },
    {
      done: indexCount > 0,
      title: "Create an index",
      detail: "Indexes tab — dynamic schema (optional mappings) with vectors (256) and auto-embed",
      tab: "indexes" as Tab,
    },
    {
      done: crawlDone,
      title: "Crawl a site",
      detail: "Crawl tab — pick or type an index, then Run (auto-index, no files)",
      tab: "spider" as Tab,
    },
    {
      done: false,
      title: "Search your content",
      detail: "Hybrid search with highlights — try fuzzy, phrase, or prefix toggles",
      tab: "search" as Tab,
      always: true,
    },
  ];

  const setupDone = fleetHealthy && indexCount > 0 && crawlDone;

  async function checkFleet() {
    setChecking(true);
    try {
      const r = await api.fleetHealth();
      setFleet(r.results);
      setFleetMsg(r.message);
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
    <>
      {!setupDone && (
        <section className="panel hero-panel">
          <p className="eyebrow">Getting started</p>
          <h2 className="hero-title">
            {indexCount === 0 && fleetHealthy
              ? "Create an index, then crawl"
              : "Indexes → Crawl → Search"}
          </h2>
          <p className="hint">
            {fleetHealthy
              ? "Local fleet is online. Follow the checklist — no manual instance registration needed."
              : "Waiting for engine, spider, and indexer. Run npm start from the repo root if the stack is down."}
          </p>
          {indexCount === 0 && fleetHealthy && (
            <div className="row" style={{ marginBottom: "1rem" }}>
              <button type="button" className="btn" onClick={() => onNavigate("indexes")}>
                Create index
              </button>
              <button type="button" className="btn secondary" onClick={() => onNavigate("documents")}>
                Seed demo data
              </button>
            </div>
          )}
          {indexCount === 0 && fleetHealthy && (
            <p className="hint" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
              Demo seed: run <code>npm run demo:seed</code> from the repo root, then browse Documents or
              Search.
            </p>
          )}
          <ol className="setup-list">
            {steps.map((s) => (
              <li key={s.title} className={s.done ? "done" : ""}>
                <div>
                  <strong>{s.title}</strong>
                  <span>{s.detail}</span>
                </div>
                {!s.done && (
                  <button type="button" className="btn secondary" onClick={() => onNavigate(s.tab)}>
                    Open
                  </button>
                )}
                {s.done && <span className="badge ok">done</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Fleet health</h2>
            <p className="hint">{fleetMsg}</p>
          </div>
          <button
            type="button"
            className="btn secondary"
            disabled={checking}
            onClick={() => void checkFleet()}
          >
            {checking ? "Checking…" : "↻ Recheck"}
          </button>
        </div>
        <div className="stat-row">
          <div className="stat">
            <strong>
              {online}/{fleet.length || instances.length}
            </strong>
            <span>Online</span>
          </div>
          <div className="stat">
            <strong>{running.length}</strong>
            <span>Running jobs</span>
          </div>
          <div className="stat">
            <strong>{failed.length}</strong>
            <span>Recent failures</span>
          </div>
          <div className="stat">
            <strong>{indexCount}</strong>
            <span>Indexes (active engine)</span>
          </div>
        </div>
        {fleet.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Instance</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {fleet.map((f) => (
                <tr key={f.id}>
                  <td>
                    <strong>{f.name}</strong>
                    {!f.enabled && <span className="badge muted"> disabled</span>}
                  </td>
                  <td>
                    <span className="badge accent">{f.kind}</span>
                  </td>
                  <td>
                    <span className={`badge ${f.ok ? "ok" : "err"}`}>
                      {f.ok ? "online" : "offline"}
                    </span>
                    <span className="hint"> {f.message}</span>
                  </td>
                  <td>{f.ok ? `${f.latencyMs} ms` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="hint">
            No instances yet. Run <code>npm start</code> to auto-seed the local fleet, or register workers
            under Instances.
          </p>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Quick actions</h2>
        </div>
        <div className="action-grid">
          <button type="button" className="action-card" onClick={() => onNavigate("indexes")}>
            <strong>Create index</strong>
            <span>Dynamic schema with hybrid search ready defaults</span>
          </button>
          <button type="button" className="action-card" onClick={() => onNavigate("spider")}>
            <strong>Crawl a site</strong>
            <span>Crawl tab — auto-index pages into your engine</span>
          </button>
          <button type="button" className="action-card" onClick={() => onNavigate("search")}>
            <strong>Search</strong>
            <span>Keyword, hybrid, geo — with highlights</span>
          </button>
          <button type="button" className="action-card" onClick={() => onNavigate("jobs")}>
            <strong>Watch jobs</strong>
            <span>
              {running.length
                ? `${running.length} running — open logs`
                : "Pipeline history and crawl logs"}
            </span>
          </button>
        </div>
        {engineId && engines.length > 0 && (
          <p className="hint">
            Active engine context is set. Indexes, Documents, and Search share it.
          </p>
        )}
      </section>

      {failed.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Needs attention</h2>
            <button type="button" className="btn ghost" onClick={() => onNavigate("jobs")}>
              Jobs →
            </button>
          </div>
          <ul className="attention-list">
            {failed.map((j) => (
              <li key={j.id}>
                <span className="badge err">{j.kind}</span> {j.configName ?? j.id}: {j.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {auditEntries.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Recent activity</h2>
            <button type="button" className="btn ghost" onClick={() => onNavigate("audit")}>
              Audit →
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.slice(0, 6).map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.at).toLocaleString()}</td>
                  <td>{e.actorName ?? "—"}</td>
                  <td>
                    {e.action}
                    {e.target ? ` · ${e.target}` : ""}
                  </td>
                  <td>
                    <span className={`badge ${e.ok ? "ok" : "err"}`}>{e.ok ? "ok" : "fail"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
