import { useState, useMemo } from "react";
import { api, type HubInstance, type IndexerConfigRow } from "../api";
import { WEB_SEED_MAPPINGS_JSON, WEB_SETTINGS } from "../web-mappings";

export function IndexerPanel({
  configs,
  indexers,
  engines,
  onRefresh,
  flash,
  onGoJobs,
}: {
  configs: IndexerConfigRow[];
  indexers: HubInstance[];
  engines: HubInstance[];
  onRefresh: () => Promise<void>;
  flash: (m: string, t?: "ok" | "err") => void;
  onGoJobs: () => void;
}) {
  const [engineInstanceId, setEngineInstanceId] = useState(engines[0]?.id ?? "");
  const [bulkIndexName, setBulkIndexName] = useState("articles");
  const [docsJson, setDocsJson] = useState(`[
  {
    "id": "bulk-1",
    "fields": {
      "title": "Anvesh Search Engine",
      "body": "Fast, embedded search pipeline built by VaagaTech",
      "url": "https://www.vaagatech.com"
    }
  }
]`);
  const [showFileConfigs, setShowFileConfigs] = useState(false);
  const [name, setName] = useState("web-articles-import");
  const [indexName, setIndexName] = useState("articles");
  const [inputPath, setInputPath] = useState("/tmp/data.jsonl");
  const [instanceId, setInstanceId] = useState(indexers[0]?.id ?? "");

  const enabledEngines = useMemo(() => engines.filter((e) => e.enabled), [engines]);
  const enabledIndexers = useMemo(() => indexers.filter((i) => i.enabled), [indexers]);

  function handleFileImport(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const parsed = JSON.parse(text);
        setDocsJson(JSON.stringify(parsed, null, 2));
        flash("File loaded.", "ok");
      } catch {
        const lines = text.split("\n").filter((l) => l.trim());
        try {
          const docs = lines.map((l) => JSON.parse(l));
          setDocsJson(JSON.stringify(docs, null, 2));
          flash(`Loaded ${docs.length} documents from JSONL.`, "ok");
        } catch {
          flash("Could not parse file as JSON or JSONL.", "err");
        }
      }
    };
    reader.readAsText(file);
  }

  async function ensureIndexOnEngine(engId: string, targetIndex: string) {
    const existing = await api.listIndexes(engId);
    if (existing.indexes?.some((i) => i.name === targetIndex)) return;
    await api.createIndex(engId, {
      name: targetIndex,
      mappings: JSON.parse(WEB_SEED_MAPPINGS_JSON),
      settings: { ...WEB_SETTINGS },
    });
  }

  return (
    <div className="panel-container">
      <section className="panel">
        <div className="panel-head">
          <h2>JSON Bulk Importer</h2>
        </div>
        <p className="hint">
          Upload JSON documents to bulk-index into your target Engine.
        </p>
        <div className="grid-2">
          <div className="field">
            <label>Engine Target Node</label>
            <select value={engineInstanceId} onChange={(e) => setEngineInstanceId(e.target.value)}>
              <option value="">Select Engine Node…</option>
              {enabledEngines.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Target Index Name</label>
            <input
              value={bulkIndexName}
              onChange={(e) => setBulkIndexName(e.target.value)}
              placeholder="e.g. articles"
            />
          </div>
        </div>

        <div className="field">
          <label>Import File (JSON or JSONL)</label>
          <input
            type="file"
            accept=".json,.jsonl,.ndjson"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileImport(file);
            }}
          />
        </div>

        <div className="field">
          <label>Payload JSON</label>
          <textarea
            value={docsJson}
            onChange={(e) => setDocsJson(e.target.value)}
            rows={8}
            style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}
          />
        </div>

        <button
          type="button"
          className="btn"
          disabled={!engineInstanceId || !bulkIndexName.trim() || !docsJson.trim()}
          onClick={() => {
            try {
              const parsed = JSON.parse(docsJson);
              const docs = Array.isArray(parsed) ? parsed : [parsed];
              const target = bulkIndexName.trim();
              void ensureIndexOnEngine(engineInstanceId, target)
                .then(() => api.ingestDocs(engineInstanceId, target, docs, false))
                .then((r) => {
                  flash((r as { message?: string }).message ?? `Imported ${docs.length} docs into "${target}".`, "ok");
                })
                .catch((e) => flash(e.message, "err"));
            } catch {
              flash("Invalid JSON format.", "err");
            }
          }}
        >
          Import to Engine
        </button>
      </section>

      <section className="panel">
        <button
          type="button"
          className="btn secondary"
          onClick={() => setShowFileConfigs((v) => !v)}
        >
          {showFileConfigs ? "Hide Advanced File Configs" : "Advanced: Worker File Pipeline Configs"}
        </button>

        {showFileConfigs && (
          <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
            <h3>Indexer Worker Jobs</h3>
            <p className="hint">Point indexer worker instance at host file paths for background streaming.</p>
            <div className="grid-2">
              <div className="field">
                <label>Config Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label>Target Index</label>
                <input value={indexName} onChange={(e) => setIndexName(e.target.value)} />
              </div>
              <div className="field">
                <label>Input Host Path</label>
                <input value={inputPath} onChange={(e) => setInputPath(e.target.value)} />
              </div>
              <div className="field">
                <label>Indexer Worker Node</label>
                <select value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
                  <option value="">Select Indexer Node…</option>
                  {enabledIndexers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (!instanceId) {
                  flash("Select an enabled indexer worker node.", "err");
                  return;
                }
                void api
                  .saveIndexerConfig({
                    name,
                    indexName,
                    inputPath,
                    instanceId,
                    engineInstanceId: engineInstanceId || undefined,
                  })
                  .then(async (r) => {
                    flash((r as { message: string }).message);
                    await onRefresh();
                  })
                  .catch((e) => flash(e.message, "err"));
              }}
            >
              Save Worker Config
            </button>

            {configs.length > 0 && (
              <div className="table-container" style={{ marginTop: "1.5rem" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Config Name</th>
                      <th>Target Index</th>
                      <th>Input Path</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configs.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td><span className="badge ok">{c.indexName}</span></td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>{c.inputPath || "—"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}
                              onClick={() => {
                                void api
                                  .runIndexer(c.id)
                                  .then((r) => {
                                    flash((r as { message?: string }).message || "Indexer job triggered!");
                                    onGoJobs();
                                  })
                                  .catch((e) => flash(e.message, "err"));
                              }}
                            >
                              Run Ingestion
                            </button>
                            <button
                              type="button"
                              className="btn danger"
                              style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}
                              onClick={() =>
                                void api
                                  .deleteIndexerConfig(c.id)
                                  .then(async () => {
                                    flash("Config deleted.");
                                    await onRefresh();
                                  })
                                  .catch((e) => flash(e.message, "err"))
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
