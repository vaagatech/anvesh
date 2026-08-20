import { useState, useEffect } from "react";
import { api, type HubInstance, type IndexInfo, type IndexDetail, type IndexedDocument, type DeadLetterEntry } from "../api";
import { Pager } from "../components/Pager";

export function DocumentsPanel({
  engines,
  engineId,
  setEngineId,
  indexes,
  indexName,
  setIndexName,
  flash,
  onSearch,
}: {
  engines: HubInstance[];
  engineId: string;
  setEngineId: (v: string) => void;
  indexes: IndexInfo[];
  indexName: string;
  setIndexName: (v: string) => void;
  flash: (m: string, t?: "ok" | "err") => void;
  onSearch: () => void;
}) {
  const [indexDetail, setIndexDetail] = useState<IndexDetail | null>(null);
  const [docsJson, setDocsJson] = useState(`[
  {
    "id": "doc-1",
    "fields": {
      "title": "Hello Anvesh",
      "body": "Lightweight search by VaagaTech",
      "url": "https://www.vaagatech.com/"
    }
  }
]`);
  const [listed, setListed] = useState<IndexedDocument[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listFrom, setListFrom] = useState(0);
  const [inspectDoc, setInspectDoc] = useState<IndexedDocument | null>(null);
  const [deadLetters, setDeadLetters] = useState<DeadLetterEntry[]>([]);
  const [dlLoading, setDlLoading] = useState(false);
  const listSize = 10;

  useEffect(() => {
    if (!indexName && indexes[0]) setIndexName(indexes[0].name);
  }, [indexes, indexName, setIndexName]);

  useEffect(() => {
    if (!engineId || !indexName) {
      setIndexDetail(null);
      return;
    }
    api
      .getIndex(engineId, indexName)
      .then((r) => setIndexDetail(r.index))
      .catch(() => setIndexDetail(null));
  }, [engineId, indexName]);

  async function refreshDeadLetters() {
    setDlLoading(true);
    try {
      const res = await api.listDeadLetter(undefined, indexName || undefined, 30);
      setDeadLetters(res.entries || []);
    } catch {
      // ignore
    } finally {
      setDlLoading(false);
    }
  }

  async function refreshList(nextFrom = listFrom) {
    if (!engineId || !indexName) return;
    try {
      const r = await api.listDocuments(engineId, indexName, nextFrom, listSize);
      setListed(r.documents ?? []);
      setListTotal(r.total ?? 0);
      setListFrom(nextFrom);
      void refreshDeadLetters();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not list documents", "err");
    }
  }

  useEffect(() => {
    if (engineId && indexName) void refreshList(0);
    else {
      setListed([]);
      setListTotal(0);
    }
  }, [engineId, indexName]);

  function handleFileImport(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const parsed = JSON.parse(text) as unknown;
        setDocsJson(JSON.stringify(parsed, null, 2));
        flash(`Loaded "${file.name}"`);
      } catch {
        flash("Invalid JSON file.", "err");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="panel-container">
      <section className="panel">
        <div className="panel-head">
          <h2>Document Ingestion & Explorer</h2>
          <button type="button" className="btn secondary" onClick={onSearch}>
            Search Playground →
          </button>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Engine Node</label>
            <select value={engineId} onChange={(e) => setEngineId(e.target.value)}>
              <option value="">Select Engine…</option>
              {engines.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Target Index</label>
            <select value={indexName} onChange={(e) => setIndexName(e.target.value)}>
              <option value="">Select Index…</option>
              {indexes.map((i) => (
                <option key={i.name} value={i.name}>{i.name} ({i.docCount ?? 0} docs)</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h3>Ingest JSON Payload</h3>
            <label className="btn secondary" style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem", cursor: "pointer" }}>
              📁 Drop / Upload JSON File
              <input
                type="file"
                accept=".json,.ndjson"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileImport(f);
                }}
              />
            </label>
          </div>
          <textarea
            value={docsJson}
            onChange={(e) => setDocsJson(e.target.value)}
            rows={8}
            style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}
          />
          <div style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="btn"
              disabled={!engineId || !indexName}
              onClick={() => {
                try {
                  const parsed = JSON.parse(docsJson);
                  const docs = Array.isArray(parsed) ? parsed : [parsed];
                  void api
                    .ingestDocs(engineId, indexName, docs)
                    .then(async (r) => {
                      flash((r as { message?: string }).message ?? "Documents ingested!", "ok");
                      await refreshList(0);
                    })
                    .catch((e: Error) => flash(e.message, "err"));
                } catch {
                  flash("Invalid JSON syntax.", "err");
                }
              }}
            >
              Ingest Documents
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Indexed Documents ({listTotal})</h2>
          <button type="button" className="btn ghost" onClick={() => void refreshList(listFrom)}>
            ↻ Refresh
          </button>
        </div>
        {listed.length === 0 ? (
          <p className="hint">No documents found in index "{indexName || "none"}".</p>
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Title / Summary</th>
                    <th>Fields</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {listed.map((doc) => {
                    const fields = doc.fields ?? {};
                    const title = String(fields.title ?? fields.name ?? doc.id);
                    return (
                      <tr key={doc.id}>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--accent-cyan)" }}>{doc.id}</td>
                        <td style={{ fontWeight: 600 }}>{title}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                          {Object.keys(fields).join(", ")}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button
                              type="button"
                              className="btn secondary"
                              style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }}
                              onClick={() => setInspectDoc(doc)}
                            >
                              Inspect JSON
                            </button>
                            <button
                              type="button"
                              className="btn danger"
                              style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }}
                              onClick={() =>
                                void api
                                  .deleteDocument(engineId, indexName, doc.id)
                                  .then(async () => {
                                    flash(`Document "${doc.id}" deleted.`);
                                    await refreshList(listFrom);
                                  })
                                  .catch((e) => flash(e.message, "err"))
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: "1rem" }}>
              <Pager
                from={listFrom}
                size={listSize}
                total={listTotal}
                onChange={(next) => void refreshList(next)}
              />
            </div>
          </>
        )}
      </section>

      <section className="panel" style={{ borderLeft: "3px solid var(--accent-amber)" }}>
        <div className="panel-head">
          <div>
            <h2>Dead-Letter Queue ({deadLetters.length})</h2>
            <p className="hint" style={{ margin: 0 }}>
              Isolated failures during crawl/bulk-index. Valid records continued uninterrupted.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn ghost"
              disabled={dlLoading}
              onClick={() => void refreshDeadLetters()}
            >
              ↻ Refresh
            </button>
            {deadLetters.length > 0 && engineId && indexName && (
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  void api
                    .replayDeadLetter(engineId, indexName)
                    .then((r) => {
                      flash(r.message ?? `Replayed ${r.replayed} records.`, "ok");
                      void refreshList(0);
                    })
                    .catch((e: Error) => flash(e.message, "err"));
                }}
              >
                ⚡ Replay All
              </button>
            )}
          </div>
        </div>

        {deadLetters.length === 0 ? (
          <p className="hint">No dead-letter records. System running cleanly without unhandled failures.</p>
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
                </tr>
              </thead>
              <tbody>
                {deadLetters.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ fontSize: "0.78rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </td>
                    <td>
                      <span className="badge warning" style={{ textTransform: "uppercase", fontSize: "0.7rem" }}>
                        {entry.source}
                      </span>
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                      {entry.recordId || entry.targetIndex || "—"}
                    </td>
                    <td style={{ color: "var(--color-danger)", fontSize: "0.82rem" }}>
                      {entry.error}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {JSON.stringify(entry.payload)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {inspectDoc && (
        <>
          <div className="drawer-backdrop" onClick={() => setInspectDoc(null)} />
          <div className="drawer">
            <div className="panel-head">
              <h2>Document — {inspectDoc.id}</h2>
              <button type="button" className="btn ghost" onClick={() => setInspectDoc(null)}>✕</button>
            </div>
            <pre style={{ background: "var(--bg-input)", padding: "1rem", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-mono)", fontSize: "0.8rem", overflowX: "auto" }}>
              {JSON.stringify(inspectDoc, null, 2)}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
