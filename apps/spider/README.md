# Anvesh Spider

Full-site crawler with **role-based post-login** discovery. Part of the Anvesh monorepo by [VaagaTech](https://www.vaagatech.com).

## What it does

1. Starts from seed URL(s) and optionally sitemaps  
2. Walks same-host links up to `maxDepth` / `maxPages`  
3. Respects `robots.txt` (configurable)  
4. Runs **one crawl pass per role** (guest, user, admin, …)  
5. Logs in via form, cookies, or headers before authenticated passes  
6. Tags each page with the `roles` that could fetch it (2xx)  
7. Writes JSONL for the **indexer**

Pages that return 401/403 for a role are skipped for that role (so admin-only routes are only tagged `admin`).

## Local usage (no Docker)

```bash
# from repo root
npm install
npm run build -w @vaagatech/anvesh-shared
npm run build -w @vaagatech/anvesh-spider

# quick anonymous crawl
npm run start -w @vaagatech/anvesh-spider -- --seed https://example.com --out .anvesh/crawl/out.jsonl

# role-based crawl
npm run start -w @vaagatech/anvesh-spider -- --config apps/spider/examples/spider.config.example.json
```

Then index:

```bash
npm run start -w @vaagatech/anvesh-indexer -- --index web --input .anvesh/crawl/out.jsonl
```

## Role config sketch

```json
{
  "roles": [
    { "name": "guest", "anonymous": true },
    {
      "name": "user",
      "login": {
        "url": "https://app.example.com/login",
        "method": "POST",
        "body": { "email": "{{username}}", "password": "{{password}}" },
        "username": "user@example.com",
        "password": "secret"
      }
    },
    {
      "name": "admin",
      "headers": { "authorization": "Bearer …" }
    }
  ]
}
```

See `examples/spider.config.example.json`.
