import { useEffect, useState } from "react";
import { api, type HubInstance, type IndexInfo, type SearchHit } from "../api";
import { Pager } from "../components/Pager";

function snippetFromHit(hit: SearchHit, key: string): string {
  const hl = hit.highlight?.[key];
  if (hl?.length) return hl.join(" … ");
  const v = hit.source?.fields?.[key];
  return v == null ? "" : String(v);
}

export function SearchPanel({
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
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"keyword" | "semantic" | "hybrid" | "geo">("hybrid");
  const [vectorJson, setVectorJson] = useState("");
  const [showVector, setShowVector] = useState(false);
  const [lat, setLat] = useState("12.9716");
  const [lon, setLon] = useState("77.5946");
  const [distanceKm, setDistanceKm] = useState("25");
  const [highlight, setHighlight] = useState(true);
  const [fuzzy, setFuzzy] = useState(false);
  const [phrase, setPhrase] = useState(false);
  const [prefix, setPrefix] = useState(false);
  const [size, setSize] = useState(10);
  const [from, setFrom] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [took, setTook] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [curl, setCurl] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!indexName && indexes[0]) setIndexName(indexes[0].name);
  }, [indexes, indexName, setIndexName]);

  const samples: Array<{ label: string; q: string; mode: typeof mode }> = [
    { label: "exact: BM25", q: "BM25 keyword", mode: "keyword" },
    { label: "paraphrase: nearby places", q: "places near me on a map", mode: "semantic" },
    { label: "paraphrase: meaning match", q: "find similar meaning without exact words", mode: "semantic" },
    { label: "hybrid: crawl site", q: "crawl a website into search", mode: "hybrid" },
    { label: "hybrid: hub access", q: "admin roles for the control plane", mode: "hybrid" },
  ];

  async function runSearch(nextFrom = from) {
    if (!engineId || !indexName) {
      flash("Pick an engine and index first.", "err");
      return;
    }
    const payload: Record<string, unknown> = {
      mode,
      highlight,
      size,
      from: nextFrom,
    };
    if (mode !== "geo") payload.q = q;
    if (mode === "semantic" || mode === "hybrid") {
      if (!q.trim() && !vectorJson.trim()) {
        flash("Enter a query — the engine embeds it locally for semantic/hybrid.", "err");
        return;
      }
      if (vectorJson.trim()) {
        try {
          payload.vector = JSON.parse(vectorJson);
          if (!Array.isArray(payload.vector)) throw new Error("vector must be an array");
        } catch {
          flash("Vector must be a JSON number array.", "err");
          return;
        }
      }
    }
    if (mode === "geo") {
      payload.geo = {
        field: "location",
        origin: { lat: Number(lat), lon: Number(lon) },
        distanceKm: Number(distanceKm),
        sortByDistance: true,
      };
    }
    if (mode !== "geo") {
      if (fuzzy) payload.fuzziness = "AUTO";
      if (phrase) payload.phrase = true;
      if (prefix) payload.prefix = true;
    }

    setBusy(true);
    try {
      const r = await api.search(engineId, indexName, payload);
      setHits(r.hits ?? []);
      setTotal(r.total ?? r.hits?.length ?? 0);
      setTook(r.tookMs);
      setFrom(nextFrom);
      setMessage(r.message ?? "");
      setCurl(
        `curl -s http://ENGINE/v1/indexes/${indexName}/search -H 'content-type: application/json' -d '${JSON.stringify(payload)}'`,
      );
      flash(r.message || `Found ${r.total ?? 0} hit(s).`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Search failed", "err");
    } finally {
      setBusy(false);
    }
  }

  const maxScore = hits.reduce((m, h) => Math.max(m, h.score ?? 0), 0) || 1;

  return (
    <section className="panel search-console">
      <div className="panel-head">
        <div>
          <h2>Search console</h2>
          <p className="hint">
            Keyword = BM25 exact terms. Semantic = local embeddings (stems + synonyms). Hybrid =
            both. Weak noise scores are filtered out.
          </p>
        </div>
      </div>

      <div className="search-hero">
        <div className="grid-3">
          <div className="field">
            <label>Engine</label>
            <select value={engineId} onChange={(e) => setEngineId(e.target.value)}>
              <option value="">Select…</option>
              {engines.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Index</label>
            <select value={indexName} onChange={(e) => setIndexName(e.target.value)}>
              <option value="">Select…</option>
              {indexes.map((i) => (
                <option key={i.name} value={i.name}>
                  {i.name}
                  {i.docCount != null ? ` (${i.docCount})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="hybrid">Hybrid (recommended)</option>
              <option value="keyword">Keyword (BM25)</option>
              <option value="semantic">Semantic</option>
              <option value="geo">Geo radius</option>
            </select>
          </div>
        </div>

        {mode !== "geo" && (
          <div className="field">
            <label>Query</label>
            <div className="search-row">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Try a paraphrase — e.g. places near me on a map"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runSearch(0);
                }}
              />
              <button type="button" className="btn" disabled={busy} onClick={() => void runSearch(0)}>
                {busy ? "Searching…" : "Search"}
              </button>
            </div>
            <div className="chip-row" aria-label="Sample queries">
              {samples.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setQ(sample.q);
                    setMode(sample.mode);
                  }}
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {(mode === "semantic" || mode === "hybrid") && (
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setShowVector((v) => !v)}
            >
              {showVector ? "Hide custom vector" : "Bring your own vector (optional)"}
            </button>
            {showVector && (
              <div className="field">
                <label>Query vector</label>
                <textarea
                  value={vectorJson}
                  onChange={(e) => setVectorJson(e.target.value)}
                  rows={2}
                  placeholder="Leave empty for local auto-embed"
                />
              </div>
            )}
          </>
        )}

        {mode === "geo" && (
          <div className="grid-3">
            <div className="field">
              <label>Latitude</label>
              <input type="number" value={lat} onChange={(e) => setLat(e.target.value)} />
            </div>
            <div className="field">
              <label>Longitude</label>
              <input type="number" value={lon} onChange={(e) => setLon(e.target.value)} />
            </div>
            <div className="field">
              <label>Radius (km)</label>
              <input
                type="number"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
              />
            </div>
            <div className="row">
              <button type="button" className="btn" disabled={busy} onClick={() => void runSearch(0)}>
                Geo search
              </button>
            </div>
          </div>
        )}

        <div className="grid-3">
          <div className="field">
            <label>Page size</label>
            <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
              {[5, 10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Highlights</label>
            <select
              value={highlight ? "on" : "off"}
              onChange={(e) => setHighlight(e.target.value === "on")}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </div>
          <div className="field">
            <label>Meta</label>
            <p className="help">
              {took != null ? `${took} ms · ` : ""}
              {total} hit{total === 1 ? "" : "s"}
              {total > 0 ? ` · showing ${from + 1}–${Math.min(from + size, total)}` : ""}
            </p>
          </div>
        </div>

        {mode !== "geo" && (
          <div className="chip-row" aria-label="Query modifiers">
            <label className="toggle-chip">
              <input type="checkbox" checked={fuzzy} onChange={(e) => setFuzzy(e.target.checked)} />
              Fuzzy
            </label>
            <label className="toggle-chip">
              <input type="checkbox" checked={phrase} onChange={(e) => setPhrase(e.target.checked)} />
              Phrase
            </label>
            <label className="toggle-chip">
              <input type="checkbox" checked={prefix} onChange={(e) => setPrefix(e.target.checked)} />
              Prefix
            </label>
          </div>
        )}
      </div>

      <div className="results-head">
        <h3>Results</h3>
      </div>

      <Pager
        from={from}
        size={size}
        total={total}
        disabled={busy}
        onChange={(next) => void runSearch(next)}
      />

      {message && hits.length > 0 && <p className="hint">{message}</p>}

      {hits.length === 0 ? (
        <p className="hint">
          No strong hits. Try a sample chip, or re-seed (`npm run demo:seed`) so documents use the
          latest local embeddings.
        </p>
      ) : (
        hits.map((hit, i) => {
          const title = snippetFromHit(hit, "title") || hit.id;
          const body =
            snippetFromHit(hit, "body") ||
            snippetFromHit(hit, "description") ||
            "";
          const pct = Math.round(((hit.score ?? 0) / maxScore) * 100);
          return (
            <article key={hit.id} className="hit">
              <div className="hit-rank">#{from + i + 1}</div>
              <h3 dangerouslySetInnerHTML={{ __html: title }} />
              {body ? <p dangerouslySetInnerHTML={{ __html: body.length > 220 ? `${body.slice(0, 220)}…` : body }} /> : null}
              <div
                className="score-bar"
                title={`score ${Number(hit.score).toFixed(3)}`}
                aria-hidden="true"
              >
                <span style={{ width: `${Math.max(8, pct)}%` }} />
              </div>
              <p className="hit-meta">
                score {Number(hit.score).toFixed(3)}
                {hit.distanceKm != null ? ` · ${Number(hit.distanceKm).toFixed(1)} km` : ""}
                {hit.source?.fields?.url ? ` · ${String(hit.source.fields.url)}` : ""}
                {` · ${hit.id}`}
              </p>
            </article>
          );
        })
      )}

      {curl && (
        <div className="field" style={{ marginTop: "1rem" }}>
          <label>Copy as API</label>
          <textarea readOnly value={curl} rows={2} onFocus={(e) => e.target.select()} />
        </div>
      )}
    </section>
  );
}
