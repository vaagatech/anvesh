---
title: Crawling and roles
section: Guides
description: Full-site crawl configuration and post-login role-based discovery.
permalink: /guides/crawling/
---

## Goal

Discover every useful HTML page on a site — including routes that only appear for logged-in **roles** — and emit JSONL for the indexer.

## Pipeline

```
spider.config.json → Spider → crawl.jsonl → Indexer → Engine index
```

## Anonymous full-site crawl

```bash
npm run start -w @vaagatech/anvesh-spider -- \
  --seed https://www.example.com \
  --out .anvesh/crawl/out.jsonl \
  --max-pages 500
```

Behavior:

- BFS from seed
- Same host only (unless `allowedHosts` expanded)
- Follows links up to `maxDepth`
- Optionally loads sitemaps and respects robots.txt

## Role-based post-login crawl

Configure multiple roles. The spider runs **one complete pass per role**.

```json
{
  "seeds": ["https://app.example.com/"],
  "maxPages": 400,
  "maxDepth": 8,
  "delayMs": 300,
  "respectRobotsTxt": true,
  "followSitemaps": true,
  "outputPath": ".anvesh/crawl/app.jsonl",
  "roles": [
    { "name": "guest", "anonymous": true },
    {
      "name": "user",
      "login": {
        "url": "https://app.example.com/login",
        "method": "POST",
        "contentType": "application/x-www-form-urlencoded",
        "body": {
          "email": "{{username}}",
          "password": "{{password}}"
        },
        "username": "user@example.com",
        "password": "secret"
      }
    },
    {
      "name": "admin",
      "headers": {
        "authorization": "Bearer ADMIN_TOKEN"
      }
    }
  ],
  "denyPathPatterns": [
    "/logout",
    "\\.(png|jpe?g|gif|css|js|zip|pdf)$"
  ]
}
```

```bash
npm run start -w @vaagatech/anvesh-spider -- --config path/to/spider.config.json
```

### How roles affect results

| HTTP status for role | Result |
|----------------------|--------|
| 2xx | Page kept; role name added to `roles[]` |
| 401 / 403 | Skipped for that role (not tagged) |
| Other errors | Logged; page omitted for that fetch |

If both guest and user can open `/pricing`, the merged record has `"roles": ["guest","user"]`. Admin-only `/settings` may only list `"roles": ["admin"]`.

### Auth mechanisms

| Mechanism | Config |
|-----------|--------|
| Anonymous | `anonymous: true` |
| Form login | `login.url` + `login.body` (+ placeholders) |
| Bearer / custom headers | `headers` |
| Existing session | `cookie` string |

Sessions keep `Set-Cookie` across redirects during login and crawl.

## Allow / deny paths

- `allowPathPrefixes` — if set, pathname must start with one of them
- `denyPathPatterns` — prefix or regex to skip

## Politeness

- Raise `delayMs` on production sites
- Keep `concurrency` modest
- Leave `respectRobotsTxt: true` unless you own the site and understand the risk

## Indexing crawl output

```bash
npm run start -w @vaagatech/anvesh-indexer -- \
  --index web \
  --input .anvesh/crawl/app.jsonl
```

Search by role later:

```json
{ "q": "settings", "filters": [{ "field": "roles", "value": "admin" }] }
```

(Roles are stored as analyzed text by default — adjust mappings to `keyword` if you need exact facet filters.)

## Example file

`apps/spider/examples/spider.config.example.json`
