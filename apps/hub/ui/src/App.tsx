import { useEffect, useMemo, useState, useTransition } from "react";
import {
  api,
  getToken,
  setToken,
  type HubInstance,
  type HubUser,
  type IndexInfo,
  type IndexerConfigRow,
  type SearchHit,
  type SpiderConfigRow,
} from "./api";

type Tab = "dashboard" | "instances" | "indexes" | "spider" | "indexer" | "users" | "search";

const DEFAULT_SPIDER = `{
  "seeds": ["https://example.com/"],
  "maxPages": 100,
  "maxDepth": 4,
  "roles": [{ "name": "guest", "anonymous": true }]
}`;

export function App() {
  const [user, setUser] = useState<HubUser | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<"ok" | "err" | "">("");
  const [pending, start] = useTransition();

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("anvesh-admin-change-me");

  const [instances, setInstances] = useState<HubInstance[]>([]);
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [engineId, setEngineId] = useState("");
  const [spiderConfigs, setSpiderConfigs] = useState<SpiderConfigRow[]>([]);
  const [indexerConfigs, setIndexerConfigs] = useState<IndexerConfigRow[]>([]);
  const [users, setUsers] = useState<HubUser[]>([]);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [health, setHealth] = useState<{ users: number; instances: number } | null>(null);

  const engines = useMemo(() => instances.filter((i) => i.kind === "engine"), [instances]);
  const spiders = useMemo(() => instances.filter((i) => i.kind === "spider"), [instances]);
  const indexers = useMemo(() => instances.filter((i) => i.kind === "indexer"), [instances]);

  function flash(msg: string, t: "ok" | "err" = "ok") {
    setStatus(msg);
    setTone(t);
  }

  async function refreshAll() {
    const [inst, h] = await Promise.all([api.listInstances(), api.health()]);
    setInstances(inst.instances);
    setHealth({ users: h.users, instances: h.instances });
    if (!engineId && inst.instances.find((i) => i.kind === "engine")) {
      setEngineId(inst.instances.find((i) => i.kind === "engine")!.id);
    }
  }

  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then(async (r) => {
        setUser(r.user);
        await refreshAll();
      })
      .catch(() => setToken(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user || !engineId) return;
    if (tab === "indexes" || tab === "search") {
      api.listIndexes(engineId).then((r) => setIndexes(r.indexes ?? [])).catch((e) => flash(e.message, "err"));
    }
  }, [user, engineId, tab]);

  useEffect(() => {
    if (!user) return;
    if (tab === "spider") {
      api.listSpiderConfigs().then((r) => setSpiderConfigs(r.configs)).catch((e) => flash(e.message, "err"));
    }
    if (tab === "indexer") {
      api.listIndexerConfigs().then((r) => setIndexerConfigs(r.configs)).catch((e) => flash(e.message, "err"));
    }
    if (tab === "users" && user.role === "admin") {
      api.listUsers().then((r) => setUsers(r.users)).catch((e) => flash(e.message, "err"));
    }
  }, [user, tab]);

  if (!user) {
    return (
      <div className="login-wrap">
        <a className="skip" href="#login">Skip to login</a>
        <form
          id="login"
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              try {
                const res = await api.login(username, password);
                setToken(res.token);
                setUser(res.user);
                flash(res.message);
                await refreshAll();
              } catch (err) {
                flash(err instanceof Error ? err.message : "Login failed", "err");
              }
            });
          }}
        >
          <h1>Anvesh</h1>
          <p className="hint" style={{ marginTop: 0, color: "var(--muted)" }}>
            Hub control plane — manage engines, indexes, crawlers, and access.
          </p>
          <div className="field">
            <label htmlFor="user">Username</label>
            <input id="user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <div className="field">
            <label htmlFor="pass">Password</label>
            <input id="pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <button className="btn" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
          <p className={`status ${tone}`} role="status">{status}</p>
        </form>
      </div>
    );
  }

  const nav: { id: Tab; label: string; show?: boolean }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "instances", label: "Instances" },
    { id: "indexes", label: "Indexes" },
    { id: "search", label: "Search" },
    { id: "spider", label: "Spider", show: user.role !== "viewer" },
    { id: "indexer", label: "Indexer", show: user.role !== "viewer" },
    { id: "users", label: "Users", show: user.role === "admin" },
  ];

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <div className="shell">
        <aside className="nav" aria-label="Hub navigation">
          <p className="brand">Anvesh</p>
          <p className="brand-sub">Hub · {user.role}</p>
          {nav.filter((n) => n.show !== false).map((n) => (
            <button
              key={n.id}
              type="button"
              className={`nav-item ${tab === n.id ? "active" : ""}`}
              onClick={() => setTab(n.id)}
            >
              {n.label}
            </button>
          ))}
          <div style={{ marginTop: "1.5rem" }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() =>
                start(async () => {
                  await api.logout().catch(() => undefined);
                  setToken(null);
                  setUser(null);
                })
              }
            >
              Sign out
            </button>
          </div>
        </aside>

        <div className="main" id="main">
          <div className="topbar">
            <h1>{nav.find((n) => n.id === tab)?.label}</h1>
            <p className="user-chip">{user.username}</p>
          </div>
          <p className={`status ${tone}`} role="status" aria-live="polite">{status}</p>

          {tab === "dashboard" && (
            <section className="panel">
              <h2>Control plane</h2>
              <p className="hint">Hub coordinates multiple Anvesh application instances with RBAC.</p>
              <div className="stat-row">
                <div className="stat"><strong>{health?.instances ?? instances.length}</strong><span>Instances</span></div>
                <div className="stat"><strong>{engines.length}</strong><span>Engines</span></div>
                <div className="stat"><strong>{spiders.length}</strong><span>Spiders</span></div>
                <div className="stat"><strong>{indexers.length}</strong><span>Indexers</span></div>
              </div>
              <p className="hint">Register an engine, create indexes, save spider/indexer configs, then run jobs from Hub.</p>
            </section>
          )}

          {tab === "instances" && (
            <InstancesPanel
              instances={instances}
              onChange={async () => {
                await refreshAll();
              }}
              flash={flash}
              canManage={user.role === "admin"}
            />
          )}

          {tab === "indexes" && (
            <IndexesPanel
              engines={engines}
              engineId={engineId}
              setEngineId={setEngineId}
              indexes={indexes}
              setIndexes={setIndexes}
              flash={flash}
              canManage={user.role !== "viewer"}
            />
          )}

          {tab === "search" && (
            <SearchPanel engines={engines} engineId={engineId} setEngineId={setEngineId} indexes={indexes} hits={hits} setHits={setHits} flash={flash} />
          )}

          {tab === "spider" && user.role !== "viewer" && (
            <SpiderPanel configs={spiderConfigs} spiders={spiders} onRefresh={() => api.listSpiderConfigs().then((r) => setSpiderConfigs(r.configs))} flash={flash} />
          )}

          {tab === "indexer" && user.role !== "viewer" && (
            <IndexerPanel
              configs={indexerConfigs}
              indexers={indexers}
              engines={engines}
              onRefresh={() => api.listIndexerConfigs().then((r) => setIndexerConfigs(r.configs))}
              flash={flash}
            />
          )}

          {tab === "users" && user.role === "admin" && (
            <UsersPanel users={users} onRefresh={() => api.listUsers().then((r) => setUsers(r.users))} flash={flash} />
          )}
        </div>
      </div>
    </>
  );
}

function InstancesPanel({
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
  const [kind, setKind] = useState<"engine" | "indexer" | "spider">("engine");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:3848");
  const [apiKey, setApiKey] = useState("");

  return (
    <>
      {canManage && (
        <section className="panel">
          <h2>Register instance</h2>
          <p className="hint">Run multiple engines, indexers, or spiders and point Hub at each base URL.</p>
          <div className="grid-3">
            <div className="field"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="field">
              <label>Kind</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="engine">engine</option>
                <option value="indexer">indexer</option>
                <option value="spider">spider</option>
              </select>
            </div>
            <div className="field"><label>Base URL</label><input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></div>
          </div>
          <div className="field"><label>API key (optional)</label><input value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></div>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void api
                .createInstance({ name, kind, baseUrl, apiKey: apiKey || undefined, enabled: true })
                .then(async (r) => {
                  flash((r as { message: string }).message);
                  await onChange();
                })
                .catch((e) => flash(e.message, "err"))
            }
          >
            Add instance
          </button>
        </section>
      )}
      <section className="panel">
        <h2>Registered instances</h2>
        <table>
          <thead><tr><th>Name</th><th>Kind</th><th>URL</th><th>Actions</th></tr></thead>
          <tbody>
            {instances.map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td>{i.kind}</td>
                <td>{i.baseUrl}</td>
                <td className="row">
                  <button type="button" className="btn secondary" onClick={() => void api.pingInstance(i.id).then((r) => flash(r.message, r.ok ? "ok" : "err")).catch((e) => flash(e.message, "err"))}>Ping</button>
                  {canManage && (
                    <button type="button" className="btn danger" onClick={() => void api.deleteInstance(i.id).then(async () => { flash("Instance removed."); await onChange(); }).catch((e) => flash(e.message, "err"))}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function IndexesPanel({
  engines, engineId, setEngineId, indexes, setIndexes, flash, canManage,
}: {
  engines: HubInstance[];
  engineId: string;
  setEngineId: (v: string) => void;
  indexes: IndexInfo[];
  setIndexes: (v: IndexInfo[]) => void;
  flash: (m: string, t?: "ok" | "err") => void;
  canManage: boolean;
}) {
  const [name, setName] = useState("articles");
  const [mappingJson, setMappingJson] = useState(`{
  "title": { "type": "text" },
  "body": { "type": "text" },
  "tags": { "type": "keyword" },
  "location": { "type": "geo_point" }
}`);

  return (
    <section className="panel">
      <h2>Indexes</h2>
      <p className="hint">Create and manage indexes on any registered engine instance.</p>
      <div className="field">
        <label>Engine instance</label>
        <select value={engineId} onChange={(e) => setEngineId(e.target.value)}>
          <option value="">Select…</option>
          {engines.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      {canManage && engineId && (
        <>
          <div className="grid-2">
            <div className="field"><label>Index name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
          </div>
          <div className="field"><label>Mappings JSON</label><textarea value={mappingJson} onChange={(e) => setMappingJson(e.target.value)} /></div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              try {
                const mappings = JSON.parse(mappingJson) as Record<string, unknown>;
                void api.createIndex(engineId, { name, mappings }).then(async (r) => {
                  flash((r as { message: string }).message);
                  const list = await api.listIndexes(engineId);
                  setIndexes(list.indexes ?? []);
                }).catch((e) => flash(e.message, "err"));
              } catch {
                flash("Mappings must be valid JSON.", "err");
              }
            }}
          >
            Create index
          </button>
        </>
      )}
      <table>
        <thead><tr><th>Name</th><th>Docs</th><th>Fields</th><th></th></tr></thead>
        <tbody>
          {indexes.map((idx) => (
            <tr key={idx.name}>
              <td>{idx.name}</td>
              <td>{idx.docCount}</td>
              <td>{Object.keys(idx.mappings || {}).join(", ")}</td>
              <td>
                {canManage && engineId && (
                  <button type="button" className="btn danger" onClick={() => void api.deleteIndex(engineId, idx.name).then(async () => {
                    flash(`Index "${idx.name}" deleted.`);
                    setIndexes((await api.listIndexes(engineId)).indexes ?? []);
                  }).catch((e) => flash(e.message, "err"))}>Delete</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SearchPanel({
  engines, engineId, setEngineId, indexes, hits, setHits, flash,
}: {
  engines: HubInstance[];
  engineId: string;
  setEngineId: (v: string) => void;
  indexes: IndexInfo[];
  hits: SearchHit[];
  setHits: (h: SearchHit[]) => void;
  flash: (m: string, t?: "ok" | "err") => void;
}) {
  const [indexName, setIndexName] = useState("");
  const [q, setQ] = useState("search");

  useEffect(() => {
    if (!indexName && indexes[0]) setIndexName(indexes[0].name);
  }, [indexes, indexName]);

  return (
    <section className="panel">
      <h2>Search</h2>
      <div className="grid-3">
        <div className="field">
          <label>Engine</label>
          <select value={engineId} onChange={(e) => setEngineId(e.target.value)}>
            {engines.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Index</label>
          <select value={indexName} onChange={(e) => setIndexName(e.target.value)}>
            {indexes.map((i) => <option key={i.name} value={i.name}>{i.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Query</label><input value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <button
        type="button"
        className="btn"
        disabled={!engineId || !indexName}
        onClick={() =>
          void api.search(engineId, indexName, { q, highlight: true }).then((r) => {
            setHits(r.hits ?? []);
            flash(r.message);
          }).catch((e) => flash(e.message, "err"))
        }
      >
        Run search
      </button>
      <div>
        {hits.map((h) => (
          <article className="hit" key={h.id}>
            <strong>{h.id}</strong> · score {h.score.toFixed(4)}
            {h.distanceKm !== undefined ? ` · ${h.distanceKm} km` : ""}
            <pre>{JSON.stringify(h.source.fields, null, 2)}</pre>
          </article>
        ))}
      </div>
    </section>
  );
}

function SpiderPanel({
  configs, spiders, onRefresh, flash,
}: {
  configs: SpiderConfigRow[];
  spiders: HubInstance[];
  onRefresh: () => Promise<unknown> | unknown;
  flash: (m: string, t?: "ok" | "err") => void;
}) {
  const [name, setName] = useState("site-crawl");
  const [instanceId, setInstanceId] = useState("");
  const [configJson, setConfigJson] = useState(DEFAULT_SPIDER);

  return (
    <>
      <section className="panel">
        <h2>Spider configuration</h2>
        <p className="hint">Store crawl configs (including roles) and run them on a spider instance.</p>
        <div className="grid-2">
          <div className="field"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field">
            <label>Spider instance</label>
            <select value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
              <option value="">Select…</option>
              {spiders.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="field"><label>Config JSON</label><textarea value={configJson} onChange={(e) => setConfigJson(e.target.value)} /></div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            try {
              const config = JSON.parse(configJson) as Record<string, unknown>;
              void api.saveSpiderConfig({ name, instanceId: instanceId || undefined, config }).then(async (r) => {
                flash((r as { message: string }).message);
                await onRefresh();
              }).catch((e) => flash(e.message, "err"));
            } catch {
              flash("Config must be valid JSON.", "err");
            }
          }}
        >
          Save config
        </button>
      </section>
      <section className="panel">
        <h2>Saved configs</h2>
        <table>
          <thead><tr><th>Name</th><th>Updated</th><th>Actions</th></tr></thead>
          <tbody>
            {configs.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{new Date(c.updatedAt).toLocaleString()}</td>
                <td className="row">
                  <button type="button" className="btn" onClick={() => void api.runSpider(c.id).then((r) => flash((r as { message?: string }).message || "Crawl job accepted.")).catch((e) => flash(e.message, "err"))}>Run</button>
                  <button type="button" className="btn danger" onClick={() => void api.deleteSpiderConfig(c.id).then(async () => { flash("Deleted."); await onRefresh(); }).catch((e) => flash(e.message, "err"))}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function IndexerPanel({
  configs, indexers, engines, onRefresh, flash,
}: {
  configs: IndexerConfigRow[];
  indexers: HubInstance[];
  engines: HubInstance[];
  onRefresh: () => Promise<unknown> | unknown;
  flash: (m: string, t?: "ok" | "err") => void;
}) {
  const [name, setName] = useState("bulk-web");
  const [indexName, setIndexName] = useState("web");
  const [inputPath, setInputPath] = useState(".anvesh/crawl/out.jsonl");
  const [instanceId, setInstanceId] = useState("");
  const [engineInstanceId, setEngineInstanceId] = useState("");

  return (
    <>
      <section className="panel">
        <h2>Indexer configuration</h2>
        <p className="hint">Point at crawl output and a target engine; run on any indexer instance.</p>
        <div className="grid-2">
          <div className="field"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label>Index name</label><input value={indexName} onChange={(e) => setIndexName(e.target.value)} /></div>
          <div className="field"><label>Input path</label><input value={inputPath} onChange={(e) => setInputPath(e.target.value)} /></div>
          <div className="field">
            <label>Indexer instance</label>
            <select value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
              <option value="">Select…</option>
              {indexers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Engine instance</label>
            <select value={engineInstanceId} onChange={(e) => setEngineInstanceId(e.target.value)}>
              <option value="">Select…</option>
              {engines.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void api
              .saveIndexerConfig({
                name,
                indexName,
                inputPath,
                instanceId: instanceId || undefined,
                engineInstanceId: engineInstanceId || undefined,
              })
              .then(async (r) => {
                flash((r as { message: string }).message);
                await onRefresh();
              })
              .catch((e) => flash(e.message, "err"))
          }
        >
          Save config
        </button>
      </section>
      <section className="panel">
        <h2>Saved configs</h2>
        <table>
          <thead><tr><th>Name</th><th>Index</th><th>Actions</th></tr></thead>
          <tbody>
            {configs.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.indexName}</td>
                <td className="row">
                  <button type="button" className="btn" onClick={() => void api.runIndexer(c.id).then((r) => flash((r as { message?: string }).message || "Index job accepted.")).catch((e) => flash(e.message, "err"))}>Run</button>
                  <button type="button" className="btn danger" onClick={() => void api.deleteIndexerConfig(c.id).then(async () => { flash("Deleted."); await onRefresh(); }).catch((e) => flash(e.message, "err"))}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function UsersPanel({
  users, onRefresh, flash,
}: {
  users: HubUser[];
  onRefresh: () => Promise<unknown> | unknown;
  flash: (m: string, t?: "ok" | "err") => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("operator");

  return (
    <>
      <section className="panel">
        <h2>Create user</h2>
        <p className="hint">RBAC roles: admin (full), operator (manage indexes/jobs), viewer (read/search).</p>
        <div className="grid-3">
          <div className="field"><label>Username</label><input value={username} onChange={(e) => setUsername(e.target.value)} /></div>
          <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div className="field">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="admin">admin</option>
              <option value="operator">operator</option>
              <option value="viewer">viewer</option>
            </select>
          </div>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void api.createUser({ username, password, role }).then(async (r) => {
              flash((r as { message: string }).message);
              setUsername("");
              setPassword("");
              await onRefresh();
            }).catch((e) => flash(e.message, "err"))
          }
        >
          Create user
        </button>
      </section>
      <section className="panel">
        <h2>Users</h2>
        <table>
          <thead><tr><th>Username</th><th>Role</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.role}</td>
                <td>
                  <button type="button" className="btn danger" onClick={() => void api.deleteUser(u.id).then(async () => { flash("User removed."); await onRefresh(); }).catch((e) => flash(e.message, "err"))}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
