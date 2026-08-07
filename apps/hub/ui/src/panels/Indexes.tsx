import { useState, useRef } from "react";
import { api, type HubInstance, type IndexInfo, type IndexDetail } from "../api";
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

  async function loadIndexes() {
    if (!engineId) return;
    const r = await api.listIndexes(engineId);
    setIndexes(r.indexes ?? []);
  }

  return (
    <div className="panel-container">
      <section className="panel">
        <div className="panel-head">
          <h2>Active Engine Instance</h2>
        </div>
        <div className="field">
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
            <h3>Create New Index</h3>
            <p className="hint">Configure a search index with field mappings and vector settings.</p>
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
                  style={{ background: "none", border: 0, padding: 0, color: "var(--accent-cyan)", textDecoration: "underline", cursor: "pointer" }}
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
                const dims = vectorDimensions.trim() ? Number(vectorDimensions) : undefined;
                void api
                  .createIndex(engineId, {
                    name,
                    mappings: parsed,
                    settings: dims != null ? { vectorDimensions: dims } : undefined,
                  })
                  .then(async (r) => {
                    flash(r.message);
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

      <section className="panel">
        <div className="panel-head">
          <h2>Indexes ({indexes.length})</h2>
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
                    <td style={{ fontWeight: 700, color: "var(--accent-cyan)" }}>{idx.name}</td>
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
