---
title: Hub
section: Components
description: Optional management UI for indexes, documents, and search trials.
permalink: /components/hub/
---

## Purpose

**Hub** is an optional React UI to connect to a running engine, create indexes, ingest a sample document, and run keyword search. Anvesh works fully without Hub.

Path: `apps/hub` · **Not published to npm** (`private: true`)

## When to use it

- Local demos and operator tooling
- Exploring indexes without curling the API

## When not to use it

- Production admin without your own auth gateway (Hub stores API key in `localStorage`)
- Headless / CI environments

## Run locally

```bash
# terminal 1
npm run dev:engine

# terminal 2
npm run dev:hub
# → http://127.0.0.1:3849
```

Vite proxies `/v1` and `/health` to `http://127.0.0.1:3848`. You can also set a remote API base URL in the Connect form.

## Features

| Area | Behavior |
|------|----------|
| Connect | API base + optional API key |
| Indexes | List, create (default text mappings + vector dims), delete |
| Documents | Paste JSON and index into selected index |
| Search | Keyword query; shows score + fields |
| A11y | Skip link, live regions, focus styles, reduced motion |

## Design notes

Brand-first landing (product name **Anvesh**), moss/green palette, Fraunces + DM Sans. Hub is a thin client — all durability lives in the engine.

## Build static assets

```bash
npm run build -w @vaagatech/anvesh-hub
# output: apps/hub/dist
```

Serve `apps/hub/dist` behind any static host, pointed at your engine URL.
