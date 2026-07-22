---
title: Why Anvesh
section: Start
description: What Anvesh is for, how it compares to products in the market, and when we recommend it.
permalink: /why-anvesh/
---

**Anvesh** is the search stack you run when you want real search — keyword, semantic, hybrid, geo — without standing up Elasticsearch, paying Algolia per query, or gluing five open-source tools together.

Built by [VaagaTech](https://www.vaagatech.com). Open source (MIT). One `npm start` and you are indexing.

## The short pitch

| You get | Without |
|---------|---------|
| Full-text (BM25), vectors, hybrid, geo | A JVM cluster to babysit |
| Crawl → index → search in one monorepo | Separate crawler + ETL + search SaaS |
| Hub UI with RBAC for operators | “Just curl the API and hope” |
| Adapters to ES / OpenSearch / Solr when you outgrow native | A rewrite when requirements change |
| Plugins (Vaakly messaging) shaped like LLM tools | Opaque error strings |

**One sentence:** Anvesh is *search you can own* — light enough for a laptop, serious enough for production product search, crawl-backed site search, and RAG corpora.

## Similar products in the market

Yes — the space is crowded. Here is where Anvesh sits honestly.

### Managed / SaaS search

| Product | Strength | Gap vs Anvesh |
|---------|----------|---------------|
| **Algolia** | Instant UX, relevance tuning, hosted | Cost at scale; you don’t own the stack; no built-in crawl |
| **Typesense Cloud** / **Meilisearch Cloud** | Fast DX, typo tolerance | Hosted bill; less of a crawl→index pipeline out of the box |
| **Elastic Cloud** / **OpenSearch** managed | Full platform | Ops + cost; overkill for many Node apps |

### Self-hosted search engines

| Product | Strength | Gap vs Anvesh |
|---------|----------|---------------|
| **Elasticsearch / OpenSearch** | Mature, distributed, deep DSL | Heavy ops; not “npm start” |
| **Apache Solr** | Battle-tested Lucene | Steeper ops; Java-centric |
| **Meilisearch** | Delightful DX, typo-tolerant | Different stack; no Anvesh-style spider+roles |
| **Typesense** | Fast, faceted | Separate ecosystem; limited crawl story |
| **ZincSearch / Quickwit / Sonic** | Niche / log / minimal | Different goals (logs, ultra-light) |

### Embeddable / in-process libraries

| Product | Strength | Gap vs Anvesh |
|---------|----------|---------------|
| **Orama**, **MiniSearch**, **FlexSearch**, **Lunr** | Tiny, in-browser or in-process | Usually not a full HTTP stack + Hub + crawler |
| **Tantivy** (Rust) | High performance | Different language/runtime |

### What is *unusual* about Anvesh

Most products are **only** an engine **or** only a crawler **or** only a hosted API. Anvesh ships:

1. **Engine** — search API + Node library  
2. **Spider** — role-aware site crawl (guest / logged-in)  
3. **Indexer** — bulk load path  
4. **Hub** — operator control plane  
5. **Adapters** — speak ES/OS/Solr with one query shape when you need them  
6. **Plugins** — Vaakly corrects API summaries; tools look like LLM tool calls  

That combination is rare as a single open-source Node monorepo.

## How well can Anvesh be used today?

**Very well** for the workloads it was designed for. **Not** as a drop-in replacement for a multi-node Elastic cluster indexing billions of docs.

| Fit | Examples |
|-----|----------|
| **Excellent** | Product / docs / help-center search; internal knowledge bases; crawl your own marketing site; RAG corpora under ~low millions of docs; SaaS features that need search without a second ops team |
| **Good** | Hybrid keyword + semantic prototypes; geo “near me” catalogs; multi-role content (public + member pages) |
| **Use adapters** | You already run ES/OS/Solr and want Hub + one query shape |
| **Not the right tool** | Global e-commerce at Algolia scale; log analytics; multi-region shards/replicas as a platform |

Native Anvesh keeps indexes in memory with pluggable snapshot storage (filesystem, Redis, S3, DynamoDB, Mongo). That is a deliberate trade: **fast to run, simple to reason about**, with clear limits. See [Anvesh vs Elasticsearch]({{ '/guides/comparison/' | relative_url }}) for the honest feature matrix.

## Will we recommend it?

**Yes — when these are true:**

1. Your team is already on **Node.js** (or happy to run a small Node service).  
2. You want **ownership** (data stays with you; MIT license).  
3. You need **search + a path to crawl or bulk-load**, not only a remote SaaS box.  
4. Corpus size and QPS fit a **single well-sized process** (or a few replicas behind a load balancer sharing storage).  
5. You value **shipping this week** over configuring a cluster for three months.

**Recommend Elasticsearch / OpenSearch / Solr (via adapters or native) when:**

- You need distributed sharding, ILM, deep aggregations, or an existing ES investment.  
- Compliance / ops already standardized on Elastic.

**Recommend Algolia / Meilisearch Cloud when:**

- You want zero ops and will pay for hosted relevance UX.  
- You do not need a first-party crawler or self-hosted control plane.

**Bottom line:** If someone asks “should we use Anvesh?” — recommend it for **product and site search you can run yourself**, especially when crawl + roles + Hub matter. Do not oversell it as Elastic-at-planet-scale.

## Proof in the product

```bash
npm install
npm start -- --seed
```

- Hub → http://127.0.0.1:3849  
- Engine → http://127.0.0.1:3848  
- Demo index ready to search  

Next: [Use cases]({{ '/use-cases/' | relative_url }}) · [Operator guide]({{ '/operator-guide/' | relative_url }}) · [Getting started]({{ '/getting-started/' | relative_url }})
