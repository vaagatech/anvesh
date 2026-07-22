/**
 * Anvesh Pages try-it search — calls a configurable engine URL.
 * Persists engine URL in localStorage (anvesh.demo.engineUrl).
 */
(function () {
  const STORAGE_KEY = "anvesh.demo.engineUrl";
  const form = document.getElementById("demo-search-form");
  if (!form) return;

  const urlInput = document.getElementById("demo-engine-url");
  const queryInput = document.getElementById("demo-query");
  const statusEl = document.getElementById("demo-status");
  const resultsEl = document.getElementById("demo-results");
  const suggestBtns = document.querySelectorAll("[data-demo-q]");

  function setStatus(msg, tone) {
    statusEl.textContent = msg || "";
    statusEl.dataset.tone = tone || "";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Allow engine highlight markup (<em>) only. */
  function formatHighlight(value) {
    if (value == null) return "";
    const raw = Array.isArray(value) ? value.join(" … ") : String(value);
    return escapeHtml(raw).replace(/&lt;em&gt;/g, "<em>").replace(/&lt;\/em&gt;/g, "</em>");
  }

  function fieldText(hit, key) {
    const hl = hit.highlight && hit.highlight[key];
    if (hl) return formatHighlight(hl);
    const fields = (hit.source && hit.source.fields) || hit.fields || {};
    return escapeHtml(fields[key] ?? "");
  }

  function renderHits(payload) {
    const hits = payload.hits || payload.result?.hits || [];
    const total = payload.total ?? payload.result?.total ?? hits.length;
    const message = payload.message || "";

    if (!hits.length) {
      resultsEl.innerHTML = `<p class="demo-empty">No matches. Try “hub”, “geo”, or “lightweight”.</p>`;
      setStatus(message || "Search completed with no hits.", "ok");
      return;
    }

    resultsEl.innerHTML = hits
      .map((hit) => {
        const title = fieldText(hit, "title") || escapeHtml(hit.id);
        const body = fieldText(hit, "body");
        const score = hit.score != null ? Number(hit.score).toFixed(3) : "";
        const dist =
          hit.distanceKm != null ? `${Number(hit.distanceKm).toFixed(1)} km` : "";
        return `<article class="demo-hit">
          <h3>${title}</h3>
          <p>${body}</p>
          <p class="demo-meta">${escapeHtml(hit.id)}${score ? ` · score ${score}` : ""}${dist ? ` · ${dist}` : ""}</p>
        </article>`;
      })
      .join("");
    setStatus(message || `Found ${total} hit(s).`, "ok");
  }

  urlInput.value = localStorage.getItem(STORAGE_KEY) || "";

  urlInput.addEventListener("change", () => {
    localStorage.setItem(STORAGE_KEY, urlInput.value.trim());
  });

  suggestBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      queryInput.value = btn.getAttribute("data-demo-q") || "";
      queryInput.focus();
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const base = urlInput.value.trim().replace(/\/$/, "");
    const q = queryInput.value.trim();
    localStorage.setItem(STORAGE_KEY, base);

    if (!base) {
      setStatus("Set an Engine URL first (e.g. http://127.0.0.1:3848 or your hosted API).", "err");
      resultsEl.innerHTML = "";
      return;
    }
    if (!q) {
      setStatus("Enter a search query.", "err");
      return;
    }

    setStatus("Searching…", "");
    resultsEl.innerHTML = "";

    try {
      const res = await fetch(`${base}/v1/indexes/demo/search`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ q, highlight: true, size: 10 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(json.message || `Search failed (HTTP ${res.status}). Seed the demo index first.`, "err");
        return;
      }
      renderHits(json);
    } catch (err) {
      setStatus(
        `Could not reach the engine. Check the URL and CORS. ${err instanceof Error ? err.message : ""}`,
        "err",
      );
    }
  });
})();
