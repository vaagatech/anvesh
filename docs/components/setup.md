---
title: Setup
section: Components
description: Easy installer CLI that scaffolds a local Anvesh multi-app stack.
permalink: /components/setup/
---

## Purpose

`@vaagatech/anvesh-setup` is a small installation helper. It does not pull containers or replace Hub — it creates folders, env files, and prints clear run commands.

```bash
npx @vaagatech/anvesh-setup init
npx @vaagatech/anvesh-setup doctor
npx @vaagatech/anvesh-setup print-services
```

## What `init` creates

| Path | Use |
|------|-----|
| `.anvesh/data` | Engine filesystem indexes |
| `.anvesh/hub` | Hub RBAC / config state |
| `.anvesh/crawl` | Spider output |
| `.anvesh/configs` | Starter spider JSON |
| `.env.anvesh` | Ports + generated admin password |

Keep it lightweight: edit env, start processes, register them in Hub.
