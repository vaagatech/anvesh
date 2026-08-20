import { useState } from "react";
import { api, type HubInstance, type IndexInfo, type IndexDetail, type IndexSnapshot } from "../api";
import { WEB_MAPPINGS_JSON, WEB_SEED_MAPPINGS_JSON, WEB_SETTINGS } from "../web-mappings";

export function IndexesPanel({
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

  // Snapshot Drawer state
  const [snapshotTargetIndex, setSnapshotTargetIndex] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<IndexSnapshot[]>([]);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);

  async function loadIndexes() {
    if (!engineId) return;
    const r = await api.listIndexes(engineId);
    setIndexes(r.indexes ?? []);
  }

  async function openSnapshotDrawer(idxName: string) {
    setSnapshotTargetIndex(idxName);
    setLoadingSnapshots(true);
    try {
      const res = await api.listSnapshots(engineId, idxName);
      setSnapshots(res.snapshots ?? []);
    } catch (e: any) {
      flash(e.message, "err");
      setSnapshots([]);
    } finally {
      setLoadingSnapshots(false);
    }
  }

  return (
    <div className="panel-container">
      {/* 1. Active Engine Instance & Persistence Status */}
      <section className="panel" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)" }}>
        <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2>Search Engine Node & Persistence Tier</h2>
            <p className="hint" style={{ marginTop: "0.25rem" }}>
              Indexes and vector stores are persisted durably in OCI Object Storage with local high-speed caching & atomic snapshots.
            </p>
          </div>
          <div>
            <span className="badge ok" style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}>
              ☁️ OCI Object Storage (Tiered)
            </span>
          </div>
        </div>

        <div className="field" style={{ marginTop: "1rem" }}>
          <select value={engineId} onChange={(e) => setEngineId(e.target.value)}>
            <option value="">Select Engine Node…</option>
            {engines.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.baseUrl})
              </option>
            ))}
          </select>
        </div>

        {canManage && engineId && (
          <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)" }}>
            <h3>Create New Search Index</h3>
            <p className="hint">Configure a search index with full-text field mappings and vector dimensional settings.</p>
            <div className="grid-2">
              <div className="field">
                <label>Index Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. articles" />
              </div>
              <div className="field">
                <label>Vector Dimensions</label>
                <input
                  type="number"
                  value={vectorDimensions}
                  onChange={(e) => setVectorDimensions(e.target.value)}
                  placeholder="256"
                />
              </div>
            </div>
            <div className="field">
              <label>Mappings JSON</label>
              <textarea
                value={mappingJson}
                onChange={(e) => setMappingJson(e.target.value)}
                rows={5}
                style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}
              />
              <p className="hint" style={{ marginTop: "0.4rem" }}>
                Use{" "}
                <button
                  type="button"
                  style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", textDecoration: "underline", cursor: "pointer" }}
                  onClick={() => setMappingJson(WEB_SEED_MAPPINGS_JSON)}
                >
                  web seed mappings
                </button>{" "}
                for standard web crawler field definitions.
              </p>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                let parsed: Record<string, unknown> | undefined;
                if (mappingJson.trim()) {
                  try {
                    parsed = JSON.parse(mappingJson);
                  } catch {
                    flash("Mappings must be valid JSON.", "err");
                    return;
                  }
                }
                const dims = parseInt(vectorDimensions, 10);
                const settings = Number.isFinite(dims) && dims > 0 ? { vectorDimensions: dims } : undefined;
                void api
                  .createIndex(engineId, { name, mappings: parsed, settings })
                  .then(async (r) => {
                    flash((r as { message: string }).message);
                    await loadIndexes();
                  })
                  .catch((e) => flash(e.message, "err"));
              }}
            >
              Create Index
            </button>
          </div>
        )}
      </section>

      {/* 2. Indexes Table */}
      <section className="panel">
        <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Indexes ({indexes.length})</h2>
          <button type="button" className="btn secondary" onClick={() => void loadIndexes()}>
            🔄 Refresh Indexes
          </button>
        </div>
        {indexes.length === 0 ? (
          <p className="hint">No indexes found on this engine node.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Index Name</th>
                  <th>Documents</th>
                  <th>Fields</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {indexes.map((idx) => (
                  <tr key={idx.name}>
                    <td style={{ fontWeight: 700, color: "var(--accent)" }}>{idx.name}</td>
                    <td><span className="badge ok">{idx.docCount ?? "0"} docs</span></td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {Object.keys(idx.mappings || {}).join(", ") || "Dynamic"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
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
                          style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                          onClick={() => void openSnapshotDrawer(idx.name)}
                        >
                          📸 Snapshots
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                          onClick={() => onNavigateDocuments(idx.name)}
                        >
                          Ingest →
                        </button>
                        {canManage && (
                          <button
                            type="button"
                            className="btn danger"
                            style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                            onClick={() =>
                              void api
                                .deleteIndex(engineId, idx.name)
                                .then(async () => {
                                  flash(`Index "${idx.name}" dropped.`);
                                  await loadIndexes();
                                })
                                .catch((e) => flash(e.message, "err"))
                            }
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. Snapshot & Reversion Drawer */}
      {snapshotTargetIndex && (
        <>
          <div className="drawer-backdrop" onClick={() => setSnapshotTargetIndex(null)} />
          <div className="drawer" style={{ width: "min(600px, 90vw)" }}>
            <div className="panel-head">
              <h2>Snapshots & Rollback — {snapshotTargetIndex}</h2>
              <button type="button" className="btn ghost" onClick={() => setSnapshotTargetIndex(null)}>✕</button>
            </div>
            <p className="hint">
              Point-in-time immutable snapshots stored in OCI Object Storage. Restore any previous version if data corruption occurs.
            </p>

            {canManage && (
              <div style={{ padding: "1rem", borderRadius: "var(--radius-sm)", background: "var(--bg-input)", marginBottom: "1.5rem" }}>
                <label style={{ fontWeight: 600, fontSize: "0.85rem", display: "block", marginBottom: "0.35rem" }}>
                  Create On-Demand Backup Snapshot
                </label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    value={snapshotNote}
                    onChange={(e) => setSnapshotNote(e.target.value)}
                    placeholder="e.g. Before bulk customer data import"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      void api
                        .createSnapshot(engineId, snapshotTargetIndex, snapshotNote)
                        .then(async (r) => {
                          flash(r.message, "ok");
                          setSnapshotNote("");
                          await openSnapshotDrawer(snapshotTargetIndex);
                        })
                        .catch((e) => flash(e.message, "err"))
                    }
                  >
                    Take Snapshot
                  </button>
                </div>
              </div>
            )}

            <h3>Available Snapshots ({snapshots.length})</h3>
            {loadingSnapshots ? (
              <p className="hint">Loading snapshot history from Object Storage…</p>
            ) : snapshots.length === 0 ? (
              <p className="hint">No snapshot history found yet for this index.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.75rem" }}>
                {snapshots.map((s, idx) => (
                  <div
                    key={s.id}
                    style={{
                      padding: "0.85rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: idx === 0 ? "rgba(255,255,255,0.03)" : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <strong style={{ fontSize: "0.9rem", color: "var(--accent)" }}>{s.id}</strong>
                        {idx === 0 && <span className="badge ok" style={{ marginLeft: "0.5rem", fontSize: "0.65rem" }}>Latest Sync</span>}
                      </div>
                      <span className="badge" style={{ fontSize: "0.75rem" }}>{s.docCount} docs</span>
                    </div>
                    {s.note && <p style={{ margin: "0.35rem 0", fontSize: "0.8rem", color: "var(--text-main)" }}>{s.note}</p>}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      <span>🕒 {new Date(s.createdAt).toLocaleString()}</span>
                      <span style={{ fontFamily: "var(--font-mono)" }}>SHA: {s.checksum.slice(0, 10)}…</span>
                    </div>

                    {canManage && (
                      <div style={{ marginTop: "0.75rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to revert index "${snapshotTargetIndex}" to snapshot ${s.id}? Live index data will be rolled back.`)) {
                              void api
                                .revertSnapshot(engineId, snapshotTargetIndex, s.id)
                                .then(async (r) => {
                                  flash(r.message, "ok");
                                  await loadIndexes();
                                  setSnapshotTargetIndex(null);
                                })
                                .catch((e) => flash(e.message, "err"));
                            }
                          }}
                        >
                          ⚡ Revert to this Version
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* 4. Details Drawer */}
      {detailIndex && (
        <>
          <div className="drawer-backdrop" onClick={() => setDetailIndex(null)} />
          <div className="drawer">
            <div className="panel-head">
              <h2>Index Details — {detailIndex.name}</h2>
              <button type="button" className="btn ghost" onClick={() => setDetailIndex(null)}>✕</button>
            </div>
            <div className="field">
              <label>Document Count</label>
              <p style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--status-ok)" }}>{detailIndex.docCount}</p>
            </div>
            <div className="field">
              <label>Settings JSON</label>
              <pre style={{ background: "var(--bg-input)", padding: "1rem", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-mono)", fontSize: "0.8rem", overflowX: "auto" }}>
                {JSON.stringify(detailIndex.settings, null, 2)}
              </pre>
            </div>
            <div className="field">
              <label>Mappings JSON</label>
              <pre style={{ background: "var(--bg-input)", padding: "1rem", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-mono)", fontSize: "0.8rem", overflowX: "auto" }}>
                {JSON.stringify(detailIndex.mappings, null, 2)}
              </pre>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
