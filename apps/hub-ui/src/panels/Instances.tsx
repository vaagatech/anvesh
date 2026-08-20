import { useState } from "react";
import { api, type HubInstance, type HubInstanceKind } from "../api";

const KIND_DESCRIPTIONS: Record<string, { label: string; desc: string; type: "Native Core" | "Native Worker" | "External Adapter" }> = {
  engine: {
    label: "Search Engine",
    desc: "Anvesh Core Search Engine. Handles real-time search, ranking, fuzzy matching, and index CRUD.",
    type: "Native Core",
  },
  spider: {
    label: "Spider Crawler",
    desc: "Anvesh Web Crawler daemon. Crawls websites, parses HTML DOM & sitemaps, extracts structured data.",
    type: "Native Worker",
  },
  indexer: {
    label: "Bulk Indexer",
    desc: "Anvesh Ingestion Worker. Ingests raw JSONL files, batch document streams, and spider crawl dumps.",
    type: "Native Worker",
  },
  elasticsearch: {
    label: "Elasticsearch",
    desc: "External Elasticsearch cluster (v7/v8) managed via Anvesh Hub federated search adapter.",
    type: "External Adapter",
  },
  opensearch: {
    label: "OpenSearch",
    desc: "External OpenSearch cluster (AWS / Self-hosted) queried via Anvesh Hub adapter.",
    type: "External Adapter",
  },
  solr: {
    label: "Apache Solr",
    desc: "External Apache Solr search collection.",
    type: "External Adapter",
  },
};

export function InstancesPanel({
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
  const [showManualForm, setShowManualForm] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<HubInstanceKind>("engine");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);

  const [editTarget, setEditTarget] = useState<HubInstance | null>(null);
  const [editName, setEditName] = useState("");
  const [editKind, setEditKind] = useState<HubInstanceKind>("engine");
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
    <div className="panel-container">
      {/* 1. Infrastructure Overview & Kind Guide */}
      <section className="panel" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)" }}>
        <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2>Service Discovery & Cluster Registry</h2>
            <p className="hint" style={{ marginTop: "0.25rem" }}>
              In-cluster microservices (Engine, Spider, Indexer) auto-register and discover each other automatically across K3s.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => void onChange().then(() => flash("Refreshed cluster registry.", "ok"))}
            >
              🔄 Refresh Registry
            </button>
            {canManage && (
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShowManualForm(!showManualForm)}
              >
                {showManualForm ? "✕ Close Manual Registration" : "+ Connect External / Remote Engine"}
              </button>
            )}
          </div>
        </div>

        {/* Kind Reference Cards */}
        <div className="grid-3" style={{ marginTop: "1rem", gap: "1rem" }}>
          <div style={{ padding: "0.85rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-subtle)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
              <strong style={{ color: "var(--accent)" }}>Engine</strong>
              <span className="badge ok" style={{ fontSize: "0.7rem" }}>Native Core</span>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
              Search query execution, BM25/Vector scoring, fuzzy matching, and index shard storage (Port 3848).
            </p>
          </div>
          <div style={{ padding: "0.85rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-subtle)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
              <strong style={{ color: "#a855f7" }}>Spider</strong>
              <span className="badge" style={{ fontSize: "0.7rem" }}>Worker Daemon</span>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
              Web crawling worker daemon. Crawls sitemaps, web domains, and authenticated post-login portals (Port 3851).
            </p>
          </div>
          <div style={{ padding: "0.85rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-subtle)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
              <strong style={{ color: "#3b82f6" }}>Indexer</strong>
              <span className="badge" style={{ fontSize: "0.7rem" }}>Worker Daemon</span>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
              Bulk document ingestion pipeline. Transforms crawl output & JSONL files directly into engine shards (Port 3852).
            </p>
          </div>
        </div>
      </section>

      {/* 2. Optional Manual Connect Form (for external Elasticsearch / OpenSearch) */}
      {canManage && showManualForm && (
        <section className="panel" style={{ borderLeft: "3px solid var(--accent)" }}>
          <div className="panel-head">
            <h2>Connect Remote / External Instance</h2>
          </div>
          <p className="hint">
            Use this form only if you want to federate an external search cluster (e.g. AWS OpenSearch, Elasticsearch, or off-cluster crawler).
          </p>
          <div className="grid-3">
            <div className="field">
              <label>Instance Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. prod-opensearch-cluster" />
            </div>
            <div className="field">
              <label>Kind / Protocol</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="engine">engine (Native Anvesh)</option>
                <option value="spider">spider (Native Crawler)</option>
                <option value="indexer">indexer (Native Pipeline)</option>
                <option value="elasticsearch">elasticsearch (External v7/v8)</option>
                <option value="opensearch">opensearch (External AWS/Self-hosted)</option>
                <option value="solr">solr (External Apache Solr)</option>
              </select>
            </div>
            <div className="field">
              <label>Service Endpoint URL</label>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://opensearch.example.com" />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label>API Key / Auth Token</label>
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Optional Bearer token or API key"
              />
            </div>
            <div className="field">
              <label>Notes / Tag</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Remote analytics cluster"
              />
            </div>
          </div>
          <div className="field" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              id="inst-enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              style={{ width: "auto" }}
            />
            <label htmlFor="inst-enabled" style={{ margin: 0, cursor: "pointer" }}>Enable Instance Immediately</label>
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
                  setShowManualForm(false);
                  await onChange();
                })
                .catch((e) => flash(e.message, "err"))
            }
          >
            Register Instance
          </button>
        </section>
      )}

      {/* 3. Discovered & Registered Instances Table */}
      <section className="panel">
        <div className="panel-head">
          <h2>Active Fleet Registry ({instances.length} Services)</h2>
        </div>
        {instances.length === 0 ? (
          <p className="hint">No instances discovered or registered yet.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Service / Node</th>
                  <th>Kind / Role</th>
                  <th>Internal Endpoint</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {instances.map((i) => {
                  const meta = KIND_DESCRIPTIONS[i.kind] || { label: i.kind, type: "Adapter" };
                  const isK3sInternal = i.baseUrl.includes("anvesh-") || i.baseUrl.includes(".svc.cluster.local");
                  return (
                    <tr key={i.id}>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>{i.name}</span>
                          {i.notes && <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{i.notes}</span>}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          <span className={`badge ${i.kind === "engine" ? "ok" : ""}`}>{meta.label}</span>
                          {isK3sInternal && <span className="badge" style={{ fontSize: "0.65rem", background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>K3s Service</span>}
                        </div>
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>{i.baseUrl}</td>
                      <td>
                        <span className={`badge ${i.enabled ? "ok" : ""}`}>
                          {i.enabled ? "active" : "disabled"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className="btn secondary"
                            style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                            onClick={() =>
                              void api
                                .healthInstance(i.id)
                                .then((r) =>
                                  flash((r as { message?: string }).message ?? "Service Reachable (200 OK)", "ok")
                                )
                                .catch((e) => flash(e.message, "err"))
                            }
                          >
                            Health Ping
                          </button>
                          {canManage && (
                            <>
                              <button
                                type="button"
                                className="btn secondary"
                                style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                                onClick={() => openEdit(i)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn danger"
                                style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                                onClick={() =>
                                  void api
                                    .deleteInstance(i.id)
                                    .then(async () => {
                                      flash("Instance deregistered.");
                                      await onChange();
                                    })
                                    .catch((e) => flash(e.message, "err"))
                                }
                              >
                                Deregister
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. Edit Drawer */}
      {editTarget && (
        <>
          <div className="drawer-backdrop" onClick={() => setEditTarget(null)} />
          <div className="drawer">
            <div className="panel-head">
              <h2>Edit Service — {editTarget.name}</h2>
              <button type="button" className="btn ghost" onClick={() => setEditTarget(null)}>✕</button>
            </div>
            <div className="field">
              <label>Service Name</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="field">
              <label>Kind / Protocol</label>
              <select value={editKind} onChange={(e) => setEditKind(e.target.value as typeof editKind)}>
                <option value="engine">engine (Native Anvesh Engine)</option>
                <option value="indexer">indexer (Native Bulk Indexer)</option>
                <option value="spider">spider (Native Spider Crawler)</option>
                <option value="elasticsearch">elasticsearch (External)</option>
                <option value="opensearch">opensearch (External)</option>
                <option value="solr">solr (External)</option>
              </select>
            </div>
            <div className="field">
              <label>Endpoint URL</label>
              <input value={editBaseUrl} onChange={(e) => setEditBaseUrl(e.target.value)} />
            </div>
            <div className="field">
              <label>New API Key</label>
              <input
                type="password"
                value={editApiKey}
                onChange={(e) => setEditApiKey(e.target.value)}
                placeholder="Leave blank to keep current secret"
              />
            </div>
            <div className="field">
              <label>Notes</label>
              <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </div>
            <div className="field" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                id="edit-enabled"
                checked={editEnabled}
                onChange={(e) => setEditEnabled(e.target.checked)}
                style={{ width: "auto" }}
              />
              <label htmlFor="edit-enabled" style={{ margin: 0, cursor: "pointer" }}>Enable Service</label>
            </div>
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
                    notes: editNotes,
                    enabled: editEnabled,
                  })
                  .then(async () => {
                    flash("Service configuration saved.");
                    setEditTarget(null);
                    await onChange();
                  })
                  .catch((e) => flash(e.message, "err"))
              }
            >
              Save Changes
            </button>
          </div>
        </>
      )}
    </div>
  );
}
