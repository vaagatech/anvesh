/**
 * Anvesh plugin contracts — LLM-tool-style registration and invoke.
 * VaagaTech · https://www.vaagatech.com
 */

/** JSON-Schema-lite property for tool parameters (LLM-tool compatible). */
export interface ToolParameterProperty {
  type: "string" | "number" | "boolean" | "object" | "array" | "integer";
  description?: string;
  enum?: Array<string | number | boolean>;
  items?: ToolParameterProperty;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
  default?: unknown;
  additionalProperties?: boolean;
}

export interface ToolParametersSchema {
  type: "object";
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * A single callable capability — same idea as an LLM tool:
 * name + description + JSON parameters + execute.
 */
export interface PluginTool {
  /** Unique tool id, usually `plugin.action` (e.g. `vaakly.correct_summary`). */
  name: string;
  description: string;
  parameters: ToolParametersSchema;
  execute: (
    args: Record<string, unknown>,
    ctx: PluginContext,
  ) => unknown | Promise<unknown>;
}

export type PluginKind = "messaging" | "enrichment" | "search" | "utility" | "custom";

export interface AnveshPlugin {
  /** Stable plugin id (e.g. `vaakly`). */
  name: string;
  version: string;
  description: string;
  kind?: PluginKind;
  /** Tools exposed by this plugin (LLM-tool style). */
  tools: PluginTool[];
  /** Optional lifecycle hooks for the host. */
  hooks?: PluginHooks;
}

export interface PluginHooks {
  /**
   * Correct or rewrite a user-facing summary/message before it leaves the API.
   * Return the corrected string (or the input unchanged).
   */
  correctSummary?: (
    message: string,
    meta: SummaryMeta,
    ctx: PluginContext,
  ) => string | Promise<string>;
}

export interface SummaryMeta {
  code?: string;
  vars?: Record<string, string | number | boolean | undefined | null>;
  source?: string;
}

export interface PluginContext {
  /** Host product name (e.g. anvesh-engine). */
  host: string;
  /** Opaque host extras (logger, config). */
  extras?: Record<string, unknown>;
}

/** LLM-friendly tool descriptor (no execute function). */
export interface ToolDescriptor {
  name: string;
  description: string;
  parameters: ToolParametersSchema;
  plugin: string;
  pluginVersion: string;
  kind?: PluginKind;
}

export interface PluginDescriptor {
  name: string;
  version: string;
  description: string;
  kind?: PluginKind;
  tools: ToolDescriptor[];
}

export interface InvokeResult {
  ok: boolean;
  tool: string;
  result?: unknown;
  error?: string;
}
