---
title: Plugins
section: Guides
description: Create Anvesh plugins with LLM-tool-style tools, enable Vaakly, and invoke them from the engine API.
permalink: /guides/plugins/
---

Anvesh plugins expose **tools** the same way LLM agents do: a stable name, a short description, JSON-schema parameters, and an `execute` function. The host lists tools as a catalog and invokes them by name.

Packages:

| Package | Role |
|---------|------|
| `@vaagatech/anvesh-plugins` | Registry — register, list, invoke |
| `@vaagatech/vaakly` | Built-in messaging plugin — corrects API summary sentences |

## Enable plugins on the engine

By default the **vaakly** plugin is enabled.

```bash
# default — same as ANVESH_PLUGINS=vaakly
anvesh-engine serve

# explicit
ANVESH_PLUGINS=vaakly anvesh-engine serve

# disable all built-ins
ANVESH_PLUGINS=none anvesh-engine serve

# all built-ins
ANVESH_PLUGINS=* anvesh-engine serve
```

From code:

```ts
import { createAnveshApp } from "@vaagatech/anvesh-engine/api";

const { app, plugins } = await createAnveshApp({ plugins: ["vaakly"] });
```

## HTTP API (tool catalog + invoke)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/v1/plugins` | List registered plugins and their tools |
| `GET` | `/v1/plugins/tools` | Flat tool catalog (LLM-friendly) |
| `POST` | `/v1/plugins/invoke` | Run a tool by name |

```bash
curl -s http://127.0.0.1:3848/v1/plugins/tools | jq .

curl -s -X POST http://127.0.0.1:3848/v1/plugins/invoke \
  -H 'content-type: application/json' \
  -d '{
    "name": "vaakly.correct_summary",
    "arguments": {
      "message": "Found 1 matching document(s) in 8ms.",
      "code": "OK_SEARCH",
      "total": 1,
      "tookMs": 8
    }
  }'
```

Invoke body shape (mirrors LLM tool calls):

```json
{
  "name": "vaakly.format_message",
  "arguments": {
    "code": "OK_SEARCH",
    "vars": { "total": 3, "tookMs": 12, "mode": "keyword" }
  }
}
```

## Vaakly — summary correction

Vaakly owns the user-facing `message` field on API envelopes. It:

- Formats message codes (`OK_SEARCH`, `ERR_VALIDATION`, …)
- **Corrects** summaries (plurals, zero hits, leftover `{placeholders}`)

Library use (no plugin host required):

```ts
import { formatMessage, correctSummary } from "@vaagatech/vaakly";

formatMessage("OK_SEARCH", { total: 1, tookMs: 9 }).message;
// → "Search completed. Found 1 matching document in 9ms."

correctSummary({
  message: "Found 2 matching document(s).",
  code: "OK_SEARCH",
  total: 2,
});
```

### Built-in Vaakly tools

| Tool | Description |
|------|-------------|
| `vaakly.format_message` | Code + vars → corrected summary + log line |
| `vaakly.correct_summary` | Polish a draft summary sentence |
| `vaakly.list_codes` | List message codes and templates |

## Create your own plugin

1. Depend on `@vaagatech/anvesh-plugins`
2. Export a factory that returns an `AnveshPlugin`
3. Register it on a `PluginRegistry` (or teach the engine host about it)

```ts
import type { AnveshPlugin } from "@vaagatech/anvesh-plugins";

export function createGreetingPlugin(): AnveshPlugin {
  return {
    name: "greeting",
    version: "1.0.0",
    description: "Demo plugin that greets a caller",
    kind: "utility",
    tools: [
      {
        name: "greeting.hello",
        description: "Return a short greeting",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Who to greet" },
          },
          required: ["name"],
        },
        execute: (args) => ({ text: `Hello, ${String(args.name)}.` }),
      },
    ],
    // Optional host hooks
    hooks: {
      correctSummary: (message) => message.trim(),
    },
  };
}
```

Register next to Vaakly:

```ts
import { createEnginePluginRegistry, registerCustomPlugin } from "@vaagatech/anvesh-engine";
import { createGreetingPlugin } from "./greeting-plugin.js";

const plugins = createEnginePluginRegistry({ plugins: ["vaakly"] });
registerCustomPlugin(plugins, createGreetingPlugin());

await plugins.invoke("greeting.hello", { name: "Anvesh" });
```

### Plugin contract checklist

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Stable id (`myorg.feature`) |
| `version` | yes | Semver string |
| `description` | yes | One sentence for catalogs / LLMs |
| `kind` | no | `messaging` \| `enrichment` \| `search` \| `utility` \| `custom` |
| `tools[]` | yes | Each tool needs `name`, `description`, `parameters`, `execute` |
| `hooks.correctSummary` | no | Chain-called to polish API `message` strings |

### Tool naming

Use `plugin.action` (e.g. `vaakly.correct_summary`) so catalogs stay unique across plugins.

### Parameters schema

Keep parameters JSON-Schema-lite and LLM-friendly:

```ts
parameters: {
  type: "object",
  properties: {
    query: { type: "string", description: "User search text" },
    limit: { type: "integer", description: "Max hits", default: 10 },
  },
  required: ["query"],
}
```

## Related

- [HTTP API]({{ '/api/http/' | relative_url }})
- [Search adapters]({{ '/guides/adapters/' | relative_url }})
- [Engine component]({{ '/components/engine/' | relative_url }})
