---
title: Spider
section: Components
description: Full-site crawler with role-based post-login page discovery.
permalink: /components/spider/
---

## Purpose

The **spider** crawls an entire site (within host limits): seeds, sitemaps, and discovered links. It supports **multiple roles** so pages that exist only after login (user/admin) are discovered and tagged.

Path: `apps/spider` · Package: `@vaagatech/anvesh-spider` · Bin: `anvesh-spider`

## When to use it

- Building a search index from a website
- Capturing role-gated routes (dashboards, admin screens)
- Feeding the [indexer]({{ '/components/indexer/' | relative_url }})

## Capabilities

| Feature | Detail |
|---------|--------|
| Full-site BFS | `maxDepth`, `maxPages`, concurrency, delay |
| Same-host lock | `allowedHosts` (defaults to seed hosts) |
| robots.txt | Honored when `respectRobotsTxt: true` |
| Sitemaps | From robots + `/sitemap.xml` |
| HTML extract | Title, description, text, links (linkedom) |
| Roles | Anonymous, form login, cookie, bearer headers |
| Output | JSONL of `CrawledPage` |

## Quick crawl

```bash
npm run start -w @vaagatech/anvesh-spider -- \
  --seed https://example.com \
  --out .anvesh/crawl/out.jsonl \
  --max-pages 200
```

## Role-based config

See `apps/spider/examples/spider.config.example.json` and [Crawling & roles]({{ '/guides/crawling/' | relative_url }}).

```bash
npm run start -w @vaagatech/anvesh-spider -- \
  --config apps/spider/examples/spider.config.example.json
```

### Role auth options

1. **Anonymous** — `{ "name": "guest", "anonymous": true }`
2. **Form login** — POST/GET with `body` + `{{username}}` / `{{password}}`
3. **Headers** — e.g. `authorization: Bearer …`
4. **Cookie** — raw `cookie` string for an existing session

Each role is a **separate crawl pass**. Pages returning **401/403** for that role are skipped for that role. Successful pages accumulate `roles: ["guest","user"]` when multiple roles can see them.

## Output record (`CrawledPage`)

```json
{
  "url": "https://example.com/about",
  "finalUrl": "https://example.com/about",
  "status": 200,
  "title": "About",
  "text": "…",
  "description": "…",
  "links": ["https://example.com/…"],
  "roles": ["guest", "user"],
  "depth": 1,
  "fetchedAt": "2026-07-18T00:00:00.000Z"
}
```

## Modules

| File | Role |
|------|------|
| `crawler.ts` | Frontier, role passes, merge |
| `session.ts` | Cookies, login, fetch |
| `robots.ts` | robots.txt + sitemap parse |
| `extract.ts` | HTML → title/text/links |
| `cli.ts` | Config load + JSONL write |

## Safety tips

- Keep crawl `delayMs` polite; respect robots.
- Do not commit real passwords in example configs.
- Prefer deny patterns for logout, binary assets, and auth endpoints.

## Related

- [Crawling guide]({{ '/guides/crawling/' | relative_url }})
- [Indexer]({{ '/components/indexer/' | relative_url }})
