import { useState } from "react";
import { api, type HubInstance, type HubInstanceKind } from "../api";

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
  const [name, setName] = useState("local-engine");
  const [kind, setKind] = useState<HubInstanceKind>("engine");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:3848");
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
      {canManage && (
        <section className="panel">
          <div className="panel-head">
            <h2>Register Instance</h2>
          </div>
          <p className="hint">
            Register engine, indexer, or spider worker nodes to extend your cluster capability.
          </p>
          <div className="grid-3">
            <div className="field">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. engine-us-east" />
            </div>
            <div className="field">
              <label>Kind</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="engine">engine</option>
                <option value="indexer">indexer</option>
                <option value="spider">spider</option>
                <option value="elasticsearch">elasticsearch</option>
                <option value="opensearch">opensearch</option>
                <option value="solr">solr</option>
              </select>
            </div>
            <div className="field">
              <label>Base URL</label>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://127.0.0.1:3848" />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label>API Key</label>
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Optional bearer token"
              />
            </div>
            <div className="field">
              <label>Notes</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional description"
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
            <label htmlFor="inst-enabled" style={{ margin: 0, cursor: "pointer" }}>Enable Instance</label>
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
            Add Instance
          </button>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Cluster Instances ({instances.length})</h2>
        </div>
        {instances.length === 0 ? (
          <p className="hint">No instances registered yet.</p>
        ) : (
          <div className="table-container">
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
                    <td style={{ fontWeight: 600 }}>{i.name}</td>
                    <td>
                      <span className="badge">{i.kind}</span>
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>{i.baseUrl}</td>
                    <td>
                      <span className={`badge ${i.enabled ? "ok" : ""}`}>
                        {i.enabled ? "online" : "disabled"}
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
                                flash((r as { message?: string }).message ?? "Node Reachable", "ok")
                              )
                              .catch((e) => flash(e.message, "err"))
                          }
                        >
                          Ping Test
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editTarget && (
        <>
          <div className="drawer-backdrop" onClick={() => setEditTarget(null)} />
          <div className="drawer">
            <div className="panel-head">
              <h2>Edit Instance — {editTarget.name}</h2>
              <button type="button" className="btn ghost" onClick={() => setEditTarget(null)}>✕</button>
            </div>
            <div className="field">
              <label>Name</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="field">
              <label>Kind</label>
              <select value={editKind} onChange={(e) => setEditKind(e.target.value as typeof editKind)}>
                <option value="engine">engine</option>
                <option value="indexer">indexer</option>
                <option value="spider">spider</option>
                <option value="elasticsearch">elasticsearch</option>
                <option value="opensearch">opensearch</option>
                <option value="solr">solr</option>
              </select>
            </div>
            <div className="field">
              <label>Base URL</label>
              <input value={editBaseUrl} onChange={(e) => setEditBaseUrl(e.target.value)} />
            </div>
            <div className="field">
              <label>New API Key</label>
              <input
                type="password"
                value={editApiKey}
                onChange={(e) => setEditApiKey(e.target.value)}
                placeholder="Leave blank to keep unchanged"
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
              <label htmlFor="edit-enabled" style={{ margin: 0 }}>Enabled</label>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void api
                    .updateInstance(editTarget.id, {
                      name: editName,
                      kind: editKind,
                      baseUrl: editBaseUrl,
                      ...(editApiKey ? { apiKey: editApiKey } : {}),
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
                Save Changes
              </button>
              <button type="button" className="btn secondary" onClick={() => setEditTarget(null)}>
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
