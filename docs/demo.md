---
title: Demo
section: Start
description: Seed a demo index locally, rehearse with Hub, or try search from this page against a hosted engine.
permalink: /demo/
---

<link rel="stylesheet" href="{{ '/assets/demo/demo.css' | relative_url }}" />

<section class="demo-try" aria-labelledby="demo-try-heading">
  <p class="brand-line" id="demo-try-heading">Anvesh</p>
  <p class="support">Try keyword search against a seeded <code>demo</code> index. Point this page at your engine URL (local or hosted).</p>

  <form id="demo-search-form" class="demo-form">
    <label>
      Engine URL
      <input id="demo-engine-url" type="url" placeholder="https://your-engine.example" autocomplete="url" />
    </label>
    <label>
      Query
      <input id="demo-query" type="search" placeholder="lightweight search" value="lightweight search" required />
    </label>
    <div class="demo-actions">
      <button type="submit">Search</button>
      <div class="demo-suggest" aria-label="Sample queries">
        <button type="button" data-demo-q="lightweight search">lightweight</button>
        <button type="button" data-demo-q="hub rbac">hub rbac</button>
        <button type="button" data-demo-q="geo">geo</button>
        <button type="button" data-demo-q="spider crawl">spider</button>
      </div>
    </div>
  </form>
  <p id="demo-status" role="status" aria-live="polite"></p>
  <div id="demo-results" aria-live="polite"></div>
</section>

<script src="{{ '/assets/demo/search.js' | relative_url }}" defer></script>

## Local rehearsal (~5 minutes)

```bash
npm install
npm start -- --seed       # full stack + demo index
```

Equivalent:

```bash
npm run demo:start
```

Then open Hub at http://127.0.0.1:3849 and follow the [Operator guide]({{ '/operator-guide/' | relative_url }}) Dashboard checklist.

### Curl search

```bash
curl -s http://127.0.0.1:3848/v1/indexes/demo/search \
  -H 'content-type: application/json' \
  -d '{"q":"lightweight search","highlight":true}'
```

### Geo sample (Bengaluru radius)

```bash
curl -s http://127.0.0.1:3848/v1/indexes/demo/search \
  -H 'content-type: application/json' \
  -d '{
    "mode":"geo",
    "geo":{
      "field":"location",
      "origin":{"lat":12.9716,"lon":77.5946},
      "distanceKm":15,
      "sortByDistance":true
    }
  }'
```

### Hub UI

1. Open [http://127.0.0.1:3849](http://127.0.0.1:3849)
2. Sign in (`admin` / password from `.env.anvesh`)
3. **Search** → index `demo` → try hybrid + fuzzy toggles and the sample queries above

Local instances are registered automatically after `npm start`.

## Hosted try-it

1. Deploy the engine somewhere public (Compose, Fly, ECS, Lambda — see [Deploy]({{ '/deploy/' | relative_url }})).
2. Seed it: `ANVESH_DEMO_URL=https://your-engine.example npm run demo:seed`
3. Paste that URL into the Engine URL field on this page (saved in your browser).

GitHub Pages cannot run Node; this page only hosts the static UI.

## Corpus

Twenty sample articles live in [`examples/demo/articles.json`](https://github.com/vaagatech/anvesh-monorepo/blob/main/examples/demo/articles.json) (`title`, `body`, `tags`, `location`).
