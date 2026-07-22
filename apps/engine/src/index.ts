/**
 * @vaagatech/anvesh — public API
 */
export { AnveshEngine } from "./core/engine.js";
export { InvertedIndex } from "./core/inverted-index.js";
export { VectorStore, cosineSimilarity } from "./core/vector-store.js";
export { tokenize, stem, standardAnalyzer } from "./core/analyzer.js";
export { bm25TermScore, idf } from "./core/bm25.js";
export {
  haversineKm,
  parseGeoPoint,
  matchesGeo,
  validateGeoQuery,
} from "./core/geo.js";
export { createStorage, MemoryStorage, FilesystemStorage } from "./storage/index.js";
export type { StorageAdapter, StorageKind, StorageFactoryOptions } from "./storage/index.js";
export { createAnveshApp, listenAnvesh } from "./api/server.js";
export { formatMessage, apiEnvelope, AnveshError, correctSummary, createVaaklyPlugin } from "./messaging/vaakly.js";
export { createEnginePluginRegistry, parsePluginList, registerCustomPlugin } from "./plugins/load.js";
export { createPluginRegistry } from "@vaagatech/anvesh-plugins";
export type {
  AnveshPlugin,
  PluginRegistry,
  PluginTool,
  ToolDescriptor,
} from "@vaagatech/anvesh-plugins";
export { createLogger, logMessage } from "./logging/logger.js";
export type * from "./types.js";
