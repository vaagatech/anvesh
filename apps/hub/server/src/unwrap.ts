/** Unwrap engine index API envelopes: `{ index: { mappings } }` or bare index. */

export function unwrapIndex(json: unknown): Record<string, unknown> {
  if (!json || typeof json !== "object") return {};
  const obj = json as Record<string, unknown>;
  if (obj.index && typeof obj.index === "object") return obj.index as Record<string, unknown>;
  return obj;
}

export function unwrapMappings(json: unknown): Record<string, { type: string }> | undefined {
  const index = unwrapIndex(json);
  const mappings = index.mappings;
  if (mappings && typeof mappings === "object") {
    return mappings as Record<string, { type: string }>;
  }
  return undefined;
}

/** Dynamic mapping defaults to true when unset. */
export function unwrapDynamicMapping(json: unknown): boolean {
  const index = unwrapIndex(json);
  const settings = index.settings;
  if (!settings || typeof settings !== "object") return true;
  const dm = (settings as Record<string, unknown>).dynamicMapping;
  return dm !== false;
}
