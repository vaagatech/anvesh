---
title: Use cases
section: Start
description: Concrete ways teams use Anvesh — product search, docs, crawl-backed sites, RAG, and hybrid backends.
permalink: /use-cases/
---

These are the stories Anvesh is built for. Each includes **who it is for**, **why Anvesh fits**, and a **minimal path** to try it.

---

## 1. Product & catalog search

**Who:** SaaS and e-commerce teams adding search to listings, SKUs, or content catalogs.

**Why Anvesh:** BM25 + filters + optional vectors/hybrid + geo (“near me”) in one API. Dynamic schema learns fields as you ingest; Hub lets ops create indexes without a ticket to platform eng.

**Path:**

1. `npm start` → create index in Hub (empty mappings OK).  
2. Bulk-import JSON via Indexer or Hub Documents.  
3. Search with `q`, filters, facets; turn on `vectorDimensions` for hybrid.

**Win:** Ship search as a feature without buying Algolia on day one — migrate later via adapters if needed.

---

## 2. Documentation & help-center search

**Who:** Developer portals, support sites, internal wikis.

**Why Anvesh:** Crawl the docs site with Spider, enrich metadata (title, headings, category), index, and expose keyword/semantic search to your UI.

**Path:**

1. Hub → Spider config → seed `https://docs.example.com`.  
2. Auto-index into `docs` index.  
3. Wire your docs UI to `POST /v1/indexes/docs/search`.

**Win:** End-to-end from URL to search box, including role-gated member docs.

---

## 3. Role-aware site search (public + logged-in)

**Who:** Products with guest content and authenticated areas (pricing tiers, customer portals).

**Why Anvesh:** Spider runs **per role** (anonymous headers, cookie, or form login), tags pages with `roles`, and the engine filters at query time.

**Path:**

1. Define roles in spider config (`guest`, `user`, `admin`).  
2. Crawl → index with `roles` field.  
3. Search with a filter on the caller’s role.

**Win:** One index, correct visibility — without hand-writing a crawler session manager.

---

## 4. RAG / AI knowledge corpus

**Who:** Teams building chat or agents over company content.

**Why Anvesh:** Local auto-embed + hybrid retrieval gives “good enough” chunks for grounding. Vaakly keeps API messages clear when agents call search as a **tool**. Plugins expose LLM-shaped tools (`/v1/plugins/tools`).

**Path:**

1. Index articles / tickets / Notion exports via Indexer.  
2. Enable `vectorDimensions` + `autoEmbed`.  
3. Agent calls hybrid search (or lists plugins and invokes tools).

**Win:** Retrieval you host, with a tool catalog agents understand.

---

## 5. “Near me” / location-aware discovery

**Who:** Marketplaces, store finders, local services.

**Why Anvesh:** First-class `geo_point`, radius, bounding box, distance sort — without a separate geo microservice.

**Path:** Map `location: { lat, lon }` → search with `geo.origin` + `distanceKm`.

**Win:** Keyword + distance in one query.

---

## 6. Internal tools & admin search

**Who:** Ops and support tooling (search users, tickets, configs).

**Why Anvesh:** Embed the engine **in-process** as a library, or run the HTTP API beside your admin app. Fastify-friendly, filesystem storage for a single VM.

**Path:** `import { AnveshEngine } from "@vaagatech/anvesh-engine"` or point Hub at your engine instance.

**Win:** Search in days, not a platform project.

---

## 7. Crawl competitor / partner public sites (ethically)

**Who:** Research, SEO, content intelligence teams (respect `robots.txt`, ToS, and rate limits).

**Why Anvesh:** Spider + Indexer pipeline with concurrency and delay controls.

**Path:** Seeds + `allowedHosts` + polite `delayMs` → index → analyze in Hub Search.

**Win:** Structured corpus from the public web without a custom scrape farm.

---

## 8. Hybrid backend strategy (native + Elastic)

**Who:** Orgs already on Elasticsearch that want a lighter path for new products.

**Why Anvesh:** `@vaagatech/anvesh-search-adapters` + Hub instances of kind `elasticsearch` / `opensearch` / `solr`. Same operator UX; graduate native indexes to ES when scale demands it.

**Path:** Register ES in Hub → search/bulk through adapters; keep small apps on native Anvesh.

**Win:** One control plane, right backend per workload.

---

## 9. Demo, workshop, and open-source teaching

**Who:** Educators, conference workshops, OSS contributors.

**Why Anvesh:** `npm start -- --seed`, readable TypeScript, MIT license, meaningful Vaakly messages.

**Path:** [Demo]({{ '/demo/' | relative_url }}) page + local stack.

**Win:** Show real search architecture without a cloud account.

---

## Choosing a use case quickly

| If you need… | Start here |
|--------------|------------|
| Search box on a product | [Product & catalog](#1-product--catalog-search) |
| Search over a website | [Docs / help](#2-documentation--help-center-search) |
| Member-only pages | [Role-aware](#3-role-aware-site-search-public--logged-in) |
| LLM retrieval | [RAG](#4-rag--ai-knowledge-corpus) |
| Maps + text | [Near me](#5-near-me--location-aware-discovery) |
| Already on Elastic | [Hybrid backend](#8-hybrid-backend-strategy-native--elastic) |

Still unsure? Read [Why Anvesh]({{ '/why-anvesh/' | relative_url }}) for market fit and recommendations.
