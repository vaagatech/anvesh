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
  const [selectedHit, setSelectedHit] = useState<SearchHit | null>(null);

  useEffect(() => {
    if (!indexName && indexes[0]) setIndexName(indexes[0].name);
  }, [indexes, indexName, setIndexName]);

  const samples: Array<{ label: string; q: string; mode: typeof mode }> = [
    { label: "Capabilities", q: "WHAT ARE THE CAPABILITIES OF ANVESH", mode: "hybrid" },
    { label: "Hybrid Search", q: "hybrid full text and vector search", mode: "hybrid" },
    { label: "Exact BM25", q: "dead letter queue zero drop", mode: "keyword" },
    { label: "Tiered Storage", q: "OCI object storage tiered segments", mode: "semantic" },
    { label: "TCO & Cost", q: "85% lower infrastructure cost", mode: "hybrid" },
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
        flash("Enter a search term.", "err");
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
      flash(r.message || `Found ${r.total ?? 0} matching document(s).`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Search failed", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="search-studio-wrap">
      {/* 1. Top Search Header & Mode Bar */}
      <div className="panel" style={{ margin: 0 }}>
        <div className="panel-head">
          <div>
            <h2>Search Studio & Query Playground</h2>
            <p className="hint">
              Test hybrid BM25 + dense vector semantic retrieval, keyword exact matching, and geo-radius filters in real time.
            </p>
          </div>
          <div className="panel-actions">
            {took != null && (
              <span className="badge ok">
                ⚡ {took.toFixed(2)} ms · {total} hit{total === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="form-stack">
          <div className="search-bar-row">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search across documents, headings, and vectors… (Press Enter)"
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch(0);
              }}
              autoFocus
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || (!q.trim() && mode !== "geo")}
              onClick={() => void runSearch(0)}
              style={{ minWidth: "120px" }}
            >
              {busy ? "Searching…" : "Search"}
            </button>
          </div>

          {/* Mode Selector Chips */}
          <div className="mode-chips">
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--c-text-3)", marginRight: "0.25rem" }}>
              MODE:
            </span>
            <button
              type="button"
              className={`mode-chip ${mode === "hybrid" ? "active" : ""}`}
              onClick={() => setMode("hybrid")}
            >
              ⚡ Hybrid (BM25 + Vector)
            </button>
            <button
              type="button"
              className={`mode-chip ${mode === "keyword" ? "active" : ""}`}
              onClick={() => setMode("keyword")}
            >
              🔤 Keyword (BM25)
            </button>
            <button
              type="button"
              className={`mode-chip ${mode === "semantic" ? "active" : ""}`}
              onClick={() => setMode("semantic")}
            >
              🧠 Semantic Vector
            </button>
            <button
              type="button"
              className={`mode-chip ${mode === "geo" ? "active" : ""}`}
              onClick={() => setMode("geo")}
            >
              🌍 Geo Radius
            </button>
          </div>

          {/* Quick Sample Queries */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
            <span style={{ fontSize: "0.78rem", color: "var(--c-text-3)" }}>Try sample:</span>
            {samples.map((s) => (
              <button
                key={s.label}
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ padding: "2px 8px", fontSize: "0.75rem", borderRadius: "999px" }}
                onClick={() => {
                  setQ(s.q);
                  setMode(s.mode);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Results List */}
      <div className="panel" style={{ margin: 0 }}>
        <div className="panel-head">
          <h3>Search Results ({total})</h3>
          <div className="panel-actions">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--c-text-3)" }}>Page Size:</label>
              <select
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                style={{ width: "auto", padding: "0.35rem 1.75rem 0.35rem 0.65rem", fontSize: "0.8rem" }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>

        {hits.length === 0 ? (
          <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--c-text-3)" }}>
            <p style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.5rem" }}>No documents to display</p>
            <p className="hint">Type a query above and hit Search to query the inverted index.</p>
          </div>
        ) : (
          <div className="search-results-list">
            {hits.map((hit, idx) => {
              const title = hit.source?.fields?.title || hit.source?.fields?.name || hit.id;
              const body = hit.source?.fields?.body || hit.source?.fields?.description || "";
              const url = hit.source?.fields?.url;
              const highlightSnippet = snippetFromHit(hit, "body") || snippetFromHit(hit, "description") || String(body).slice(0, 240);

              return (
                <div key={hit.id} className="search-hit-card">
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "0.35rem" }}>
                    <h4 className="search-hit-title">
                      {url ? (
                        <a href={String(url)} target="_blank" rel="noopener noreferrer">
                          {String(title)}
                        </a>
                      ) : (
                        String(title)
                      )}
                    </h4>
                    <span className="badge ok" style={{ flexShrink: 0 }}>
                      #{from + idx + 1} · Score: {Number(hit.score).toFixed(3)}
                    </span>
                  </div>

                  {highlightSnippet && (
                    <div
                      className="search-hit-snippet"
                      dangerouslySetInnerHTML={{ __html: highlightSnippet }}
                    />
                  )}

                  <div className="search-hit-footer">
                    {typeof url === "string" && url.trim().length > 0 && (
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--c-brand)" }}>
                        {url}
                      </span>
                    )}
                    {hit.distanceKm != null && (
                      <span className="badge">{hit.distanceKm.toFixed(1)} km away</span>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ marginLeft: "auto", padding: "2px 8px", fontSize: "0.75rem" }}
                      onClick={() => setSelectedHit(hit)}
                    >
                      View Raw JSON
                    </button>
                  </div>
                </div>
              );
            })}

            <Pager
              from={from}
              size={size}
              total={total}
              onChange={(next: number) => void runSearch(next)}
            />
          </div>
        )}
      </div>

      {/* Raw JSON Modal */}
      {selectedHit && (
        <>
          <div className="drawer-backdrop" onClick={() => setSelectedHit(null)} aria-hidden="true" />
          <div className="drawer" role="dialog" aria-modal="true">
            <div className="panel-head">
              <h3>Document: {selectedHit.id}</h3>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedHit(null)}
              >
                ✕ Close
              </button>
            </div>
            <pre style={{ maxHeight: "70vh", overflow: "auto" }}>
              <code>{JSON.stringify(selectedHit, null, 2)}</code>
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
