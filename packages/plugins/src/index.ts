/**
 * @vaagatech/anvesh-plugins — plugin host for Anvesh (LLM-tool style).
 * VaagaTech · https://www.vaagatech.com
 */
export type {
  AnveshPlugin,
  InvokeResult,
  PluginContext,
  PluginDescriptor,
  PluginHooks,
  PluginKind,
  PluginTool,
  SummaryMeta,
  ToolDescriptor,
  ToolParameterProperty,
  ToolParametersSchema,
} from "./types.js";
export { PluginRegistry, createPluginRegistry } from "./registry.js";
