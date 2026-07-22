# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes |
| 0.2.x   | Yes |

## Reporting a vulnerability

Email **info@vaagatech.com** with a description, impact, and reproduction steps. Do not open a public issue for unreleased vulnerabilities.

We aim to acknowledge reports within a few business days.

## Secure mode checklist

`anvesh-setup init` generates `.env.anvesh` with **`ANVESH_SECURE=1`** by default. Before exposing Anvesh beyond localhost:

- [ ] Set strong `ANVESH_HUB_ADMIN_PASSWORD` (minimum 12 characters when secure mode is on)
- [ ] Keep `ANVESH_HUB_SECRETS_KEY` — 32-byte hex or base64; required when `ANVESH_SECURE=1`
- [ ] Set unique `ANVESH_API_KEY`, `ANVESH_SPIDER_API_KEY`, and `ANVESH_INDEXER_API_KEY`
- [ ] **Never commit `.env.anvesh`** — add to `.gitignore`; treat like production secrets
- [ ] Restrict file permissions on `.env.anvesh` (setup writes `0600`)
- [ ] Put Hub behind your network edge or SSO proxy when public
- [ ] Enable TLS for engine/Hub when not on localhost
- [ ] Tune circuit breakers for your workload (see below)

### `ANVESH_SECURE`

When `ANVESH_SECURE=1`:

- Hub **encrypts instance API keys at rest** (AES-256-GCM) using `ANVESH_HUB_SECRETS_KEY`
- Password fields mask credentials in the UI
- Minimum password length for Hub users is 12 (8 when secure mode is off)

Hub refuses to start if `ANVESH_SECURE=1` and `ANVESH_HUB_SECRETS_KEY` is missing.

### `ANVESH_HUB_SECRETS_KEY`

- Must decode to exactly **32 bytes** (64 hex chars or base64)
- Generated automatically on `anvesh-setup init`
- To rotate: generate a new key, re-enter instance API keys in Hub (old ciphertext cannot be decrypted with a new key)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Engine API key

Prefer setting `ANVESH_API_KEY` outside local development. Clients send `Authorization: Bearer <key>` or `x-api-key`. `/health` and `/ready` stay public.

## Circuit breaker env vars

Protect the in-process engine from runaway memory and concurrency:

| Variable | Default | Trip |
|----------|---------|------|
| `ANVESH_MAX_BODY_BYTES` | 5242880 (5 MB) | 413 |
| `ANVESH_MAX_BULK_DOCS` | 1000 | 400 |
| `ANVESH_MAX_CONCURRENT_SEARCH` | 32 | 429 |
| `ANVESH_MAX_RESULT_WINDOW` | 10000 | 400 |
| `ANVESH_MAX_DOCS_PER_INDEX` | 0 (disabled) | 429 on write |
| `ANVESH_MAX_RSS_MB` | 0 (disabled) | 429 before heavy ops |
| `ANVESH_MAX_FUZZY_CANDIDATES` | 50 | truncate fuzzy expansion |

Tripped counters appear on `GET /health` and `GET /v1/stats`. See [Operator guide](https://vaagatech.github.io/anvesh-monorepo/operator-guide/) and [HTTP API](https://vaagatech.github.io/anvesh-monorepo/api/http/).

## Hardening defaults

- Use encrypted storage backends and TLS for Redis/Mongo when remote.
- Keep Hub behind your own auth when exposing it publicly.
- Review Hub **Audit** for instance and credential changes.
