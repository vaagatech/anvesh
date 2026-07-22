# @vaagatech/anvesh-plugins

Plugin host for Anvesh. Plugins expose **tools** the same way LLM agents do: a name, description, JSON-schema parameters, and an `execute` function.

```ts
import { createPluginRegistry, type AnveshPlugin } from "@vaagatech/anvesh-plugins";

const registry = createPluginRegistry({ host: "my-app" });
registry.register(myPlugin);

// Catalog for an LLM / Hub UI
const tools = registry.listTools();

// Invoke like a tool call
const result = await registry.invoke("vaakly.correct_summary", {
  message: "Found 1 matching document(s) in 12ms.",
  total: 1,
  tookMs: 12,
  code: "OK_SEARCH",
});
```

See [Creating plugins](../../docs/guides/plugins.md) in the monorepo docs.
