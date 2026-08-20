import { Fragment, useEffect, useMemo, useState, memo, useRef } from "react";
import { api, type HubJob } from "../api";
import { Pager } from "../components/Pager";

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed" || status === "done"
      ? "ok"
      : status === "running" || status === "queued" || status === "pending"
        ? "warn"
        : status === "cancelled"
          ? "muted"
          : status === "failed" || status === "error"
            ? "err"
            : "muted";
  return <span className={`badge ${cls}`}>{status}</span>;
}

const JobRow = memo(function JobRow({
  j,
  canManage,
  onRefresh,
  onCancel,
  onToggleLogs,
  onDelete,
}: {
  j: HubJob;
  canManage: boolean;
  onRefresh: (id: string) => void;
  onCancel: (id: string) => void;
  onToggleLogs: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <tr>
      <td>
        <span className="badge" style={{ color: "var(--cobalt-bright)", borderColor: "var(--border)" }}>{j.kind}</span>
      </td>
      <td style={{ fontWeight: 600 }}>{j.configName ?? "—"}</td>
      <td>{j.indexName ? <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>{j.indexName}</code> : "—"}</td>
      <td>
        <StatusBadge status={j.status} />
      </td>
      <td style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{j.message}</td>
      <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-subtle)" }}>
        {new Date(j.updatedAt).toLocaleString()}
      </td>
      <td>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button type="button" className="btn secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }} onClick={() => onRefresh(j.id)} title="Refresh">↻</button>
          {canManage && (j.status === "running" || j.status === "queued") && (
            <button type="button" className="btn secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }} onClick={() => onCancel(j.id)}>Cancel</button>
          )}
          <button type="button" className="btn" style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }} onClick={() => onToggleLogs(j.id)}>Logs</button>
          {canManage && (
            <button type="button" className="btn danger" style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }} onClick={() => onDelete(j.id)}>✕</button>
          )}
        </div>
      </td>
    </tr>
  );
});

// ── Sleek Terminal Log Viewer Modal ──────────────────────────────────────────

function JobLogsModal({ j, onClose, onRefresh }: { j: HubJob; onClose: () => void; onRefresh: () => void }) {
  const [filterText, setFilterText] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const logs = j.logs ?? [];

  const filteredLogs = useMemo(() => {
    if (!filterText.trim()) return logs;
    const q = filterText.toLowerCase();
    return logs.filter((l) => l.toLowerCase().includes(q));
  }, [logs, filterText]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  function copyLogs() {
    navigator.clipboard.writeText(logs.join("\n"));
    alert("Logs copied to clipboard!");
  }

  function downloadLogs() {
    const blob = new Blob([logs.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${j.kind}_${j.id}_logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog"
        style={{
          maxWidth: "950px",
          width: "95vw",
          padding: 0,
          background: "#050c1a",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.85)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Terminal Header Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.85rem 1.25rem",
            background: "#0a1528",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
              <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#fbbf24", display: "inline-block" }} />
              <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#34d399", display: "inline-block" }} />
            </div>
            <strong style={{ fontFamily: "var(--font-mono)", fontSize: "0.9rem", color: "#ffffff" }}>
              Terminal Log Output — {j.kind} ({j.configName || j.id})
            </strong>
            <StatusBadge status={j.status} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn secondary"
              style={{ padding: "0.3rem 0.65rem", fontSize: "0.78rem" }}
              onClick={onRefresh}
            >
              ↻ Live Stream Refresh
            </button>
            <button
              type="button"
              className="btn secondary"
              style={{ padding: "0.3rem 0.65rem", fontSize: "0.78rem" }}
              onClick={copyLogs}
            >
              📋 Copy
            </button>
            <button
              type="button"
              className="btn secondary"
              style={{ padding: "0.3rem 0.65rem", fontSize: "0.78rem" }}
              onClick={downloadLogs}
            >
              ⬇ Download
            </button>
            <button
              type="button"
              className="btn ghost"
              style={{ padding: "0.3rem 0.65rem", fontSize: "1rem", color: "#ffffff" }}
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Filter Sub-bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.6rem 1.25rem",
            background: "#081020",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            gap: "1rem",
          }}
        >
          <input
            type="text"
            placeholder="🔍 Filter log entries..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{
              padding: "0.35rem 0.75rem",
              fontSize: "0.82rem",
              background: "#050c1a",
              border: "1px solid var(--border)",
              maxWidth: "350px",
            }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "var(--text-muted)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              style={{ width: "auto" }}
            />
            Auto-scroll on new entries
          </label>
        </div>

        {/* Terminal Log Output Body */}
        <div
          ref={logContainerRef}
          style={{
            height: "450px",
            overflowY: "auto",
            padding: "1rem 1.25rem",
            fontFamily: "var(--font-mono)",
            fontSize: "0.82rem",
            lineHeight: "1.6",
            color: "#e2e8f0",
            background: "#050c1a",
          }}
        >
          {filteredLogs.length === 0 ? (
            <div style={{ color: "var(--text-subtle)", fontStyle: "italic", padding: "1rem 0" }}>
              No log entries match the filter criteria.
            </div>
          ) : (
            filteredLogs.map((line, idx) => {
              const isErr = line.includes("ERR") || line.includes("failed") || line.includes("Error");
              const isWarn = line.includes("WARN") || line.includes("timeout");
              const isIndexer = line.startsWith("indexer|");

              return (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    gap: "1rem",
                    color: isErr ? "#f87171" : isWarn ? "#fbbf24" : "#e2e8f0",
                    borderBottom: "1px solid rgba(255,255,255,0.02)",
                  }}
                >
                  <span style={{ color: "var(--text-subtle)", width: "35px", flexShrink: 0, textAlign: "right", userSelect: "none" }}>
                    {idx + 1}
                  </span>
                  <span style={{ wordBreak: "break-all" }}>
                    {isIndexer ? (
                      <>
                        <span style={{ background: "rgba(147, 197, 253, 0.2)", color: "#93c5fd", padding: "0.1rem 0.3rem", borderRadius: "3px", marginRight: "0.5rem" }}>
                          indexer
                        </span>
                        {line.replace("indexer|", "")}
                      </>
                    ) : (
                      line
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export function JobsPanel({
  flash,
  canManage,
}: {
  flash: (m: string, t?: "ok" | "err") => void;
  canManage: boolean;
}) {
  const [jobs, setJobs] = useState<HubJob[]>([]);
  const [total, setTotal] = useState(0);
  const [from, setFrom] = useState(0);
  const pageSize = 20;
  const [expanded, setExpanded] = useState<string | null>(null);
  const expandedJob = useMemo(() => jobs.find((j) => j.id === expanded) || null, [jobs, expanded]);
  const [kindFilter, setKindFilter] = useState<"all" | "spider" | "indexer">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "running" | "completed" | "failed" | "cancelled"
  >("all");

  const serverStatus =
    statusFilter === "running"
      ? "running"
      : statusFilter !== "all"
        ? statusFilter
        : undefined;

  async function load(nextFrom = from) {
    const r = await api.listJobs(nextFrom, pageSize, serverStatus);
    setJobs(r.jobs);
    setTotal(r.total);
    setFrom(nextFrom);
  }

  useEffect(() => {
    void load(0).catch((e) => flash(e instanceof Error ? e.message : "Could not load jobs", "err"));
  }, [statusFilter]);

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (kindFilter !== "all" && j.kind !== kindFilter) return false;
      if (statusFilter === "running") {
        return j.status === "running" || j.status === "queued";
      }
      if (statusFilter !== "all" && j.status !== statusFilter) return false;
      return true;
    });
  }, [jobs, kindFilter, statusFilter]);

  const runningJobIds = useMemo(() => {
    return jobs
      .filter((j) => j.status === "running" || j.status === "queued")
      .map((j) => j.id);
  }, [jobs]);

  const runningIdsKey = runningJobIds.join(",");

  useEffect(() => {
    if (!runningJobIds.length) return;
    const t = setInterval(() => {
      void Promise.all(runningJobIds.map((id) => api.refreshJob(id).catch(() => null))).then(() =>
        load(from),
      );
    }, 3000);
    return () => clearInterval(t);
  }, [runningIdsKey, from]);

  return (
    <div className="panel-container">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Pipeline Jobs</h2>
            <p className="hint">
              Live crawler and indexing job executions. Click Logs for full terminal output.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => void load(from).catch((e) => flash(e.message, "err"))}
            >
              ↻ Refresh
            </button>
            {canManage && (
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  if (!confirm("Clear completed and failed jobs from Hub history?")) return;
                  void api
                    .clearFinishedJobs()
                    .then(async (r) => {
                      flash(r.message);
                      await load(0);
                    })
                    .catch((e) => flash(e.message, "err"));
                }}
              >
                Clear History
              </button>
            )}
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: "1rem" }}>
          <div className="field">
            <label>Filter by Kind</label>
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}>
              <option value="all">All Kinds (Spider & Indexer)</option>
              <option value="spider">Spider Crawler</option>
              <option value="indexer">Indexer Worker</option>
            </select>
          </div>
          <div className="field">
            <label>Filter by Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
              <option value="all">All Statuses</option>
              <option value="running">Running / Queued</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="hint">No jobs match the current filters.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Config</th>
                  <th>Index</th>
                  <th>Status</th>
                  <th>Message</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((j) => (
                  <JobRow
                    key={j.id}
                    j={j}
                    canManage={canManage}
                    onRefresh={(id) => void api.refreshJob(id).then(() => load(from))}
                    onCancel={(id) => void api.cancelJob(id).then(() => load(from))}
                    onToggleLogs={(id) => setExpanded(id)}
                    onDelete={(id) => void api.deleteJob(id).then(() => load(from))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: "1rem" }}>
          <Pager from={from} size={pageSize} total={total} onChange={(next) => void load(next)} />
        </div>
      </section>

      {expandedJob && (
        <JobLogsModal
          j={expandedJob}
          onClose={() => setExpanded(null)}
          onRefresh={() => void api.refreshJob(expandedJob.id).then(() => load(from))}
        />
      )}
    </div>
  );
}
