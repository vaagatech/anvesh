import { useState, useEffect, useMemo } from "react";
import { api, type HubInstance, type IndexInfo, type DeadLetterEntry } from "../api";

export function DeadLetterPanel({
  engines,
  engineId,
  setEngineId,
  indexes,
  indexName,
  setIndexName,
  flash,
}: {
  engines: HubInstance[];
  engineId: string;
  setEngineId: (v: string) => void;
  indexes: IndexInfo[];
  indexName: string;
  setIndexName: (v: string) => void;
  flash: (m: string, t?: "ok" | "err") => void;
}) {
  const [entries, setEntries] = useState<DeadLetterEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [inspectEntry, setInspectEntry] = useState<DeadLetterEntry | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  async function loadDeadLetters() {
    setLoading(true);
    try {
      const src = sourceFilter === "all" ? undefined : sourceFilter;
      const idx = indexName || undefined;
      const res = await api.listDeadLetter(src, idx, 100);
      setEntries(res.entries ?? []);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Failed to load dead-letter queue.", "err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDeadLetters();
  }, [sourceFilter, indexName]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(
      (e) =>
        e.error.toLowerCase().includes(q) ||
        (e.recordId && e.recordId.toLowerCase().includes(q)) ||
        (e.targetIndex && e.targetIndex.toLowerCase().includes(q)) ||
        e.source.toLowerCase().includes(q),
    );
  }, [entries, searchQuery]);

  async function handleReplayAll() {
    if (!engineId) {
      flash("Please select a target Engine instance first.", "err");
      return;
    }
    const target = indexName || (indexes[0] ? indexes[0].name : "default");
    setReplaying(true);
    try {
      const res = await api.replayDeadLetter(engineId, target);
      flash(res.message ?? `Replayed ${res.replayed} records. (${res.failed} remaining in DLQ)`, "ok");
      await loadDeadLetters();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Replay failed.", "err");
    } finally {
      setReplaying(false);
    }
  }

  async function handleReplaySingle(entry: DeadLetterEntry) {
    if (!engineId) {
      flash("Please select a target Engine instance first.", "err");
      return;
    }
    const target = entry.targetIndex || indexName || (indexes[0] ? indexes[0].name : "default");
    const idToReplay = entry.id || entry.recordId;
    if (!idToReplay) {
      flash("Entry has no record ID to replay.", "err");
      return;
    }
    setReplaying(true);
    try {
      const res = await api.replayDeadLetter(engineId, target, [idToReplay]);
      flash(res.message ?? `Record replayed successfully.`, "ok");
      await loadDeadLetters();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Single record replay failed.", "err");
    } finally {
      setReplaying(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Top Header Panel */}
      <section className="panel" style={{ borderLeft: "4px solid var(--accent-amber)" }}>
        <div className="panel-head">
          <div>
            <h2>Dead-Letter Queue & Replay Manager</h2>
            <p className="hint" style={{ margin: 0 }}>
              Isolated records from crawler fetch failures, bulk indexing errors, or schema clashes. Replay with zero downtime.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              className="btn ghost"
              disabled={loading}
              onClick={() => void loadDeadLetters()}
            >
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={replaying || entries.length === 0 || !engineId}
              onClick={() => void handleReplayAll()}
            >
              {replaying ? "Replaying…" : "⚡ Replay All to Engine"}
            </button>
          </div>
        </div>

        {/* Target Engine & Index Controls */}
        <div className="grid-3" style={{ marginTop: "1rem", gap: "1rem" }}>
          <div>
            <label className="font-label" style={{ fontSize: "0.75rem", display: "block", marginBottom: "0.3rem" }}>
              Target Engine Instance
            </label>
            <select
              className="input-select"
              value={engineId}
              onChange={(e) => setEngineId(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="">Select Engine Instance…</option>
              {engines.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.baseUrl})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-label" style={{ fontSize: "0.75rem", display: "block", marginBottom: "0.3rem" }}>
              Target / Filter Index
            </label>
            <select
              className="input-select"
              value={indexName}
              onChange={(e) => setIndexName(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="">All Indexes</option>
              {indexes.map((idx) => (
                <option key={idx.name} value={idx.name}>
                  {idx.name} ({idx.docCount ?? 0} docs)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-label" style={{ fontSize: "0.75rem", display: "block", marginBottom: "0.3rem" }}>
              Source Filter
            </label>
            <select
              className="input-select"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="all">All Sources (Engine, Spider, Indexer, Hub)</option>
              <option value="engine">Engine (:3848)</option>
              <option value="spider">Spider Crawler (:3851)</option>
              <option value="indexer">Bulk Indexer (:3852)</option>
              <option value="hub">Hub Control Plane (:3849)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Records Table Section */}
      <section className="panel">
        <div className="panel-head">
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <h2>Recorded Failures ({filteredEntries.length})</h2>
            <input
              type="text"
              placeholder="Search errors, IDs, indexes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "0.35rem 0.75rem",
                color: "#ffffff",
                fontSize: "0.82rem",
                width: "240px",
              }}
            />
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
            <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>✓ Dead-Letter Queue is Clean</p>
            <p className="hint">No failure records matching the current filters. All crawlers and batch indexers are running cleanly.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Source</th>
                  <th>Record ID / Target</th>
                  <th>Error Reason</th>
                  <th>Payload Preview</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ fontSize: "0.78rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </td>
                    <td>
                      <span className="badge warning" style={{ textTransform: "uppercase", fontSize: "0.7rem" }}>
                        {entry.source}
                      </span>
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--accent-cyan)" }}>
                      {entry.recordId || entry.targetIndex || "—"}
                    </td>
                    <td style={{ color: "var(--status-err)", fontSize: "0.82rem", maxWidth: "260px" }}>
                      {entry.error}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-muted)" }}>
                      {JSON.stringify(entry.payload)}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                          onClick={() => setInspectEntry(entry)}
                        >
                          Inspect
                        </button>
                        <button
                          type="button"
                          className="btn primary"
                          style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                          disabled={replaying || !engineId}
                          onClick={() => void handleReplaySingle(entry)}
                        >
                          ⚡ Replay
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Inspect Side Drawer */}
      {inspectEntry && (
        <>
          <div className="drawer-backdrop" onClick={() => setInspectEntry(null)} />
          <div className="drawer">
            <div className="panel-head">
              <h2>Dead-Letter Record — {inspectEntry.recordId || inspectEntry.id}</h2>
              <button type="button" className="btn ghost" onClick={() => setInspectEntry(null)}>✕</button>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <p style={{ fontSize: "0.85rem", color: "var(--status-err)", fontWeight: 600 }}>
                Error: {inspectEntry.error}
              </p>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <span className="badge warning">Source: {inspectEntry.source}</span>
                <span className="badge">Index: {inspectEntry.targetIndex || "none"}</span>
                <span className="badge">Time: {new Date(inspectEntry.timestamp).toLocaleString()}</span>
              </div>
            </div>

            <pre style={{ background: "var(--bg-input)", padding: "1rem", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-mono)", fontSize: "0.8rem", overflowX: "auto" }}>
              {JSON.stringify(inspectEntry.payload, null, 2)}
            </pre>

            <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn primary"
                disabled={replaying || !engineId}
                onClick={() => {
                  void handleReplaySingle(inspectEntry);
                  setInspectEntry(null);
                }}
              >
                ⚡ Replay to Engine Now
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
