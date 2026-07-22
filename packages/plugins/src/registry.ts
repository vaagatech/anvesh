/**
 * Plugin registry — register plugins, list tools, invoke by name.
 */
import type {
  AnveshPlugin,
  InvokeResult,
  PluginContext,
  PluginDescriptor,
  PluginTool,
  SummaryMeta,
  ToolDescriptor,
} from "./types.js";

export class PluginRegistry {
  private plugins = new Map<string, AnveshPlugin>();
  private tools = new Map<string, { plugin: AnveshPlugin; tool: PluginTool }>();

  constructor(private readonly ctx: PluginContext) {}

  register(plugin: AnveshPlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered.`);
    }
    for (const tool of plugin.tools) {
      if (this.tools.has(tool.name)) {
        throw new Error(`Tool "${tool.name}" is already registered.`);
      }
    }
    this.plugins.set(plugin.name, plugin);
    for (const tool of plugin.tools) {
      this.tools.set(tool.name, { plugin, tool });
    }
  }

  unregister(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;
    for (const tool of plugin.tools) this.tools.delete(tool.name);
    this.plugins.delete(name);
    return true;
  }

  has(name: string): boolean {
    return this.plugins.has(name);
  }

  get(name: string): AnveshPlugin | undefined {
    return this.plugins.get(name);
  }

  listPlugins(): PluginDescriptor[] {
    return [...this.plugins.values()].map((p) => ({
      name: p.name,
      version: p.version,
      description: p.description,
      kind: p.kind,
      tools: p.tools.map((t) => this.toDescriptor(p, t)),
    }));
  }

  /** Flat tool list — suitable for LLM tool catalogs. */
  listTools(): ToolDescriptor[] {
    return [...this.tools.values()].map(({ plugin, tool }) =>
      this.toDescriptor(plugin, tool),
    );
  }

  getTool(name: string): ToolDescriptor | undefined {
    const hit = this.tools.get(name);
    if (!hit) return undefined;
    return this.toDescriptor(hit.plugin, hit.tool);
  }

  async invoke(
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<InvokeResult> {
    const hit = this.tools.get(toolName);
    if (!hit) {
      return { ok: false, tool: toolName, error: `Unknown tool "${toolName}".` };
    }
    try {
      const result = await hit.tool.execute(args, this.ctx);
      return { ok: true, tool: toolName, result };
    } catch (err) {
      return {
        ok: false,
        tool: toolName,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Run `correctSummary` hooks from messaging plugins (in registration order).
   * Used by the host to polish API summary sentences.
   */
  async correctSummary(message: string, meta: SummaryMeta = {}): Promise<string> {
    let out = message;
    for (const plugin of this.plugins.values()) {
      const hook = plugin.hooks?.correctSummary;
      if (!hook) continue;
      out = await hook(out, meta, this.ctx);
    }
    return out;
  }

  private toDescriptor(plugin: AnveshPlugin, tool: PluginTool): ToolDescriptor {
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      plugin: plugin.name,
      pluginVersion: plugin.version,
      kind: plugin.kind,
    };
  }
}

export function createPluginRegistry(
  ctx: PluginContext = { host: "anvesh" },
): PluginRegistry {
  return new PluginRegistry(ctx);
}
