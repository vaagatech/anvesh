/**
 * Load and register Anvesh plugins (LLM-tool style).
 * Default: vaakly messaging plugin.
 *
 * ANVESH_PLUGINS — comma list of plugin ids, or `*` / `all` for defaults.
 * Examples: `vaakly` (default), `vaakly,myplugin`, `none` / empty to disable.
 */
import {
  createPluginRegistry,
  type AnveshPlugin,
  type PluginRegistry,
} from "@vaagatech/anvesh-plugins";
import { createVaaklyPlugin, VAAKLY_PLUGIN_NAME } from "@vaagatech/vaakly";

const BUILTIN: Record<string, () => AnveshPlugin> = {
  [VAAKLY_PLUGIN_NAME]: createVaaklyPlugin,
};

export function parsePluginList(raw: string | undefined): string[] {
  const value = (raw ?? "vaakly").trim();
  if (!value || value === "none" || value === "off" || value === "false") return [];
  if (value === "*" || value === "all" || value === "default") {
    return Object.keys(BUILTIN);
  }
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function createEnginePluginRegistry(options?: {
  plugins?: string[];
  host?: string;
  extras?: Record<string, unknown>;
}): PluginRegistry {
  const registry = createPluginRegistry({
    host: options?.host ?? "anvesh-engine",
    extras: options?.extras,
  });
  const wanted = options?.plugins ?? parsePluginList(process.env.ANVESH_PLUGINS);
  for (const name of wanted) {
    const factory = BUILTIN[name];
    if (!factory) {
      // Unknown ids are skipped so custom hosts can register later.
      continue;
    }
    if (!registry.has(name)) registry.register(factory());
  }
  return registry;
}

export function registerCustomPlugin(registry: PluginRegistry, plugin: AnveshPlugin): void {
  registry.register(plugin);
}

export { BUILTIN as BUILTIN_PLUGINS };
