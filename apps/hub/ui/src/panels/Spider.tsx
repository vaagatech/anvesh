import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  api,
  type HubInstance,
  type IndexInfo,
  type SpiderConfigRow,
} from "../api";

function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-head">
          <h2>{title}</h2>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

function IndexField({
  id,
  indexes,
  value,
  onChange,
  disabled,
  help,
}: {
  id: string;
  indexes: IndexInfo[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  help?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>Target index</label>
      <input
        id={id}
        list={`${id}-options`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. articles — pick existing or type a new name"
        disabled={disabled}
      />
      <datalist id={`${id}-options`}>
        {indexes.map((i) => (
          <option key={i.name} value={i.name}>
            {i.docCount != null ? `${i.docCount} docs` : ""}
          </option>
        ))}
      </datalist>
      {help && <p className="help">{help}</p>}
    </div>
  );
}

export function SpiderPanel({
  configs,
  spiders,
  indexers,
  engines,
  engineId,
  setEngineId,
  onRefresh,
  flash,
  onGoJobs,
}: {
  configs: SpiderConfigRow[];
  spiders: HubInstance[];
  indexers: HubInstance[];
  engines: HubInstance[];
  engineId: string;
  setEngineId: (v: string) => void;
  onRefresh: () => Promise<unknown> | unknown;
  flash: (m: string, t?: "ok" | "err") => void;
  onGoJobs: () => void;
}) {
  const enabledSpiders = useMemo(() => spiders.filter((s) => s.enabled), [spiders]);
  const enabledIndexers = useMemo(() => indexers.filter((s) => s.enabled), [indexers]);
  const enabledEngines = useMemo(() => engines.filter((s) => s.enabled), [engines]);

  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [name, setName] = useState("");
  const [seeds, setSeeds] = useState("https://www.vaagatech.com/");
  const [maxPages, setMaxPages] = useState(50);
  const [maxDepth, setMaxDepth] = useState(3);
  const [instanceId, setInstanceId] = useState("");
  const [indexName, setIndexName] = useState("articles");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedJson, setAdvancedJson] = useState("");
  const [runIndexById, setRunIndexById] = useState<Record<string, string>>({});

  const [edit, setEdit] = useState<SpiderConfigRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editIndexName, setEditIndexName] = useState("");
  const [editInstanceId, setEditInstanceId] = useState("");
  const [editSeeds, setEditSeeds] = useState("");
  const [editMaxPages, setEditMaxPages] = useState(50);
  const [editMaxDepth, setEditMaxDepth] = useState(3);
  const [editJson, setEditJson] = useState("");
  const [editAdvanced, setEditAdvanced] = useState(false);

  useEffect(() => {
    if (!instanceId && enabledSpiders[0]) setInstanceId(enabledSpiders[0].id);
  }, [enabledSpiders, instanceId]);

  useEffect(() => {
    if (!engineId && enabledEngines[0]) setEngineId(enabledEngines[0].id);
  }, [enabledEngines, engineId, setEngineId]);

  useEffect(() => {
    if (!engineId) {
      setIndexes([]);
      return;
    }
    void api
      .listIndexes(engineId)
      .then((r) => setIndexes(r.indexes ?? []))
      .catch(() => setIndexes([]));
  }, [engineId]);

  function buildConfig(): Record<string, unknown> {
    if (showAdvanced && advancedJson.trim()) {
      const parsed = JSON.parse(advancedJson) as Record<string, unknown>;
      const { indexName: _i, outputPath: _o, autoIndex: _a, ...rest } = parsed;
      return rest;
    }
    const seedList = seeds
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      seeds: seedList,
      maxPages,
      maxDepth,
      roles: [{ name: "guest", anonymous: true }],
    };
  }

  function openEdit(c: SpiderConfigRow) {
    setEdit(c);
    setEditName(c.name);
    setEditIndexName(c.indexName ?? "");
    setEditInstanceId(c.instanceId ?? enabledSpiders[0]?.id ?? "");
    const cfg = c.config ?? {};
    const seedVal = Array.isArray(cfg.seeds) ? (cfg.seeds as string[]).join("\n") : "";
    setEditSeeds(seedVal);
    setEditMaxPages(typeof cfg.maxPages === "number" ? cfg.maxPages : 50);
    setEditMaxDepth(typeof cfg.maxDepth === "number" ? cfg.maxDepth : 3);
    const { indexName: _i, outputPath: _o, autoIndex: _a, ...rest } = cfg;
    setEditJson(JSON.stringify(rest, null, 2));
    setEditAdvanced(false);
  }

  function runIndexFor(c: SpiderConfigRow): string {
    return (runIndexById[c.id] ?? c.indexName ?? indexName).trim();
  }

  function runCrawl(c: SpiderConfigRow) {
    const targetIndex = runIndexFor(c);
    if (!targetIndex) {
      flash("Type or pick an index name before running.", "err");
      return;
    }
    void api
      .runSpider(c.id, { indexName: targetIndex })
      .then((r) => {
        flash(
          (r as { message?: string }).message ||
            `Started → indexing into "${targetIndex}" (created on engine if missing).`,
        );
        onGoJobs();
      })
      .catch((e) => flash(e.message, "err"));
  }

  const indexerId = enabledIndexers[0]?.id;
  const nameTaken = (candidate: string, exceptId?: string) => {
    const key = candidate.trim().toLowerCase();
    if (!key) return false;
    return configs.some(
      (c) => c.id !== exceptId && c.name.trim().toLowerCase() === key,
    );
  };

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Crawl & index</h2>
            <p className="hint">
              Crawl a site and push pages straight into the engine (no JSONL files). Hub creates the
              index with a dynamic web schema if it does not exist yet; spider and indexer enrich
              page metadata automatically.
            </p>
          </div>
        </div>

        {(enabledSpiders.length === 0 ||
          enabledIndexers.length === 0 ||
          enabledEngines.length === 0) && (
          <div className="banner warn">
            Need workers online: spider :3851, indexer :3852, engine :3848. Run{" "}
            <code>npm start</code> or register them under Instances.
          </div>
        )}

        <div className="grid-2">
          <div className="field">
            <label>Config name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. vaagatech-site"
            />
            {nameTaken(name) && (
              <p className="help" style={{ color: "var(--danger, #b33)" }}>
                That name is already used.
              </p>
            )}
          </div>
          <div className="field">
            <label>Spider worker</label>
            <select value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
              <option value="">Select…</option>
              {enabledSpiders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Engine</label>
            <select
              value={engineId}
              onChange={(e) => {
                setEngineId(e.target.value);
              }}
            >
              <option value="">Select…</option>
              {enabledEngines.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <IndexField
            id="crawl-index"
            indexes={indexes}
            value={indexName}
            onChange={setIndexName}
            disabled={!engineId}
            help="Select an existing index or type a new name — created on Run with vectorDimensions 256 and autoEmbed."
          />
          <div className="field">
            <label>Seed URLs (one per line)</label>
            <textarea value={seeds} onChange={(e) => setSeeds(e.target.value)} rows={3} />
          </div>
          <div className="grid-2" style={{ margin: 0 }}>
            <div className="field">
              <label>Max pages</label>
              <input
                type="number"
                min={1}
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>Max depth</label>
              <input
                type="number"
                min={0}
                value={maxDepth}
                onChange={(e) => setMaxDepth(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setShowAdvanced((v) => !v);
            if (!advancedJson) {
              try {
                setAdvancedJson(JSON.stringify(buildConfig(), null, 2));
              } catch {
                /* ignore */
              }
            }
          }}
        >
          {showAdvanced ? "Hide advanced JSON" : "Advanced JSON (roles, robots, …)"}
        </button>
        {showAdvanced && (
          <div className="field">
            <label>Crawl options (index is chosen above — do not put it here)</label>
            <textarea
              value={advancedJson}
              onChange={(e) => setAdvancedJson(e.target.value)}
              rows={10}
            />
          </div>
        )}

        <div className="row" style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!name.trim()) {
                flash("Enter a config name.", "err");
                return;
              }
              if (nameTaken(name)) {
                flash(`A crawl named "${name.trim()}" already exists.`, "err");
                return;
              }
              if (!instanceId) {
                flash("Select a spider worker.", "err");
                return;
              }
              try {
                const config = buildConfig();
                void api
                  .saveSpiderConfig({
                    name: name.trim(),
                    instanceId,
                    indexName: indexName.trim() || undefined,
                    autoIndex: true,
                    indexerInstanceId: indexerId,
                    engineInstanceId: engineId || undefined,
                    config,
                  })
                  .then(async (r) => {
                    flash((r as { message: string }).message);
                    setName("");
                    await onRefresh();
                  })
                  .catch((e) => flash(e.message, "err"));
              } catch {
                flash("Invalid advanced JSON.", "err");
              }
            }}
          >
            Save crawl
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Saved crawls</h2>
        </div>
        {configs.length === 0 ? (
          <p className="hint">Save a crawl above, set an index, then Run.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Index for Run</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                  </td>
                  <td>
                    <input
                      list={`run-index-${c.id}`}
                      value={runIndexById[c.id] ?? c.indexName ?? ""}
                      onChange={(e) =>
                        setRunIndexById((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                      placeholder={indexName || "articles"}
                      aria-label={`Index for ${c.name}`}
                    />
                    <datalist id={`run-index-${c.id}`}>
                      {indexes.map((i) => (
                        <option key={i.name} value={i.name} />
                      ))}
                    </datalist>
                  </td>
                  <td className="row">
                    <button type="button" className="btn secondary" onClick={() => openEdit(c)}>
                      Edit
                    </button>
                    <button type="button" className="btn" onClick={() => runCrawl(c)}>
                      Run now
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => {
                        if (!confirm(`Delete crawl config "${c.name}"?`)) return;
                        void api
                          .deleteSpiderConfig(c.id)
                          .then(async () => {
                            flash("Deleted.");
                            await onRefresh();
                          })
                          .catch((e) => flash(e.message, "err"));
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {edit && (
        <Drawer title={`Edit ${edit.name}`} onClose={() => setEdit(null)}>
          <div className="field">
            <label>Config name</label>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} />
            {nameTaken(editName, edit.id) && (
              <p className="help" style={{ color: "var(--danger, #b33)" }}>
                That name is already used.
              </p>
            )}
          </div>
          <div className="field">
            <label>Spider worker</label>
            <select value={editInstanceId} onChange={(e) => setEditInstanceId(e.target.value)}>
              <option value="">Select…</option>
              {enabledSpiders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <IndexField
            id="edit-crawl-index"
            indexes={indexes}
            value={editIndexName}
            onChange={setEditIndexName}
            help="Optional when saving — required at Run time."
          />
          {!editAdvanced ? (
            <>
              <div className="field">
                <label>Seed URLs</label>
                <textarea
                  value={editSeeds}
                  onChange={(e) => setEditSeeds(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>Max pages</label>
                  <input
                    type="number"
                    value={editMaxPages}
                    onChange={(e) => setEditMaxPages(Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label>Max depth</label>
                  <input
                    type="number"
                    value={editMaxDepth}
                    onChange={(e) => setEditMaxDepth(Number(e.target.value))}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="field">
              <label>Crawl JSON</label>
              <textarea value={editJson} onChange={(e) => setEditJson(e.target.value)} rows={10} />
            </div>
          )}
          <button
            type="button"
            className="btn ghost"
            onClick={() => setEditAdvanced((v) => !v)}
          >
            {editAdvanced ? "Simple form" : "Advanced JSON"}
          </button>
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (!editName.trim()) {
                  flash("Name is required.", "err");
                  return;
                }
                if (nameTaken(editName, edit.id)) {
                  flash(`A crawl named "${editName.trim()}" already exists.`, "err");
                  return;
                }
                try {
                  let config: Record<string, unknown>;
                  if (editAdvanced) {
                    const parsed = JSON.parse(editJson) as Record<string, unknown>;
                    const { indexName: _i, outputPath: _o, autoIndex: _a, ...rest } = parsed;
                    config = rest;
                  } else {
                    config = {
                      seeds: editSeeds
                        .split(/\n|,/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                      maxPages: editMaxPages,
                      maxDepth: editMaxDepth,
                      roles: [{ name: "guest", anonymous: true }],
                    };
                  }
                  void api
                    .updateSpiderConfig(edit.id, {
                      name: editName.trim(),
                      indexName: editIndexName.trim() || null,
                      autoIndex: true,
                      instanceId: editInstanceId || undefined,
                      indexerInstanceId: indexerId,
                      engineInstanceId: engineId || edit.engineInstanceId,
                      config,
                    })
                    .then(async (r) => {
                      flash((r as { message: string }).message);
                      setEdit(null);
                      await onRefresh();
                    })
                    .catch((e) => flash(e.message, "err"));
                } catch {
                  flash("Invalid JSON.", "err");
                }
              }}
            >
              Save
            </button>
            <button type="button" className="btn ghost" onClick={() => setEdit(null)}>
              Cancel
            </button>
          </div>
        </Drawer>
      )}
    </>
  );
}
