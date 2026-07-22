# @vaagatech/vaakly

Vaakly formats and **corrects** Anvesh API summary messages (clear plurals, empty-result wording, tone). It ships as:

1. A **library** — `formatMessage`, `apiEnvelope`, `AnveshError`, `correctSummary`
2. An **Anvesh plugin** — tools you can list and invoke like LLM tools

```ts
import { formatMessage, createVaaklyPlugin } from "@vaagatech/vaakly";
import { createPluginRegistry } from "@vaagatech/anvesh-plugins";

formatMessage("OK_SEARCH", { total: 3, tookMs: 12 }).message;
// → "Search completed. Found 3 matching documents in 12ms."

const registry = createPluginRegistry({ host: "anvesh-engine" });
registry.register(createVaaklyPlugin());
await registry.invoke("vaakly.correct_summary", {
  message: "Found 1 matching document(s) in 8ms.",
  code: "OK_SEARCH",
  total: 1,
  tookMs: 8,
});
```

### Tools

| Tool | Purpose |
|------|---------|
| `vaakly.format_message` | Code + vars → corrected summary + log line |
| `vaakly.correct_summary` | Polish a draft summary sentence |
| `vaakly.list_codes` | Catalog of message codes / templates |

See [Creating plugins](../../docs/guides/plugins.md).
