import type { SearchBackendKind } from "./types.js";

/** Hub instance kinds that route through search adapters (excluding native engine). */
export const SEARCH_BACKEND_HUB_KINDS = ["elasticsearch", "opensearch", "solr"] as const;

export type SearchBackendHubKind = (typeof SEARCH_BACKEND_HUB_KINDS)[number];

export function isSearchBackendHubKind(kind: string): kind is SearchBackendHubKind {
  return (SEARCH_BACKEND_HUB_KINDS as readonly string[]).includes(kind);
}

export function hubKindToBackendKind(kind: string): SearchBackendKind {
  if (kind === "engine") return "anvesh";
  if (kind === "elasticsearch" || kind === "opensearch" || kind === "solr") return kind;
  throw new Error(`Instance kind "${kind}" is not a search backend`);
}

/** Instance kinds that support index list + search via Hub. */
export const HUB_SEARCH_INSTANCE_KINDS = ["engine", ...SEARCH_BACKEND_HUB_KINDS] as const;

export function isHubSearchInstanceKind(kind: string): boolean {
  return (HUB_SEARCH_INSTANCE_KINDS as readonly string[]).includes(kind);
}
