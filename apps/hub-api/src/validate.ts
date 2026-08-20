/**
 * Validate document fields against an Anvesh index mapping.
 */
import type { FieldMapping } from "./types.js";

export interface ValidationIssue {
  path: string;
  message: string;
}

function isGeoPoint(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string" && /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(v.trim())) return true;
  if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number")) return true;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const lat = o.lat;
    const lon = o.lon ?? o.lng;
    return typeof lat === "number" && typeof lon === "number";
  }
  return false;
}

function checkField(path: string, mapping: FieldMapping, value: unknown): ValidationIssue[] {
  if (value === undefined || value === null) return [];
  switch (mapping.type) {
    case "text":
    case "keyword":
    case "date":
      if (typeof value !== "string" && typeof value !== "number") {
        return [{ path, message: `Expected string for ${mapping.type}, got ${typeof value}.` }];
      }
      return [];
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) {
        return [{ path, message: `Expected number, got ${typeof value}.` }];
      }
      return [];
    case "boolean":
      if (typeof value !== "boolean") {
        return [{ path, message: `Expected boolean, got ${typeof value}.` }];
      }
      return [];
    case "vector":
      if (!Array.isArray(value) || !value.every((n) => typeof n === "number")) {
        return [{ path, message: "Expected number[] vector." }];
      }
      return [];
    case "geo_point":
      if (!isGeoPoint(value)) {
        return [{ path, message: "Expected geo_point ({lat,lon}, [lon,lat], or \"lat,lon\")." }];
      }
      return [];
    default:
      return [{ path, message: `Unknown mapping type.` }];
  }
}

export function validateDocumentsAgainstMappings(
  mappings: Record<string, FieldMapping>,
  documents: Array<{ id?: string; fields?: Record<string, unknown>; vector?: number[] }>,
  options: { allowUnknownFields?: boolean } = {},
): { ok: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const mappedKeys = new Set(Object.keys(mappings));
  const allowUnknown = options.allowUnknownFields !== false;

  documents.forEach((doc, i) => {
    const prefix = `documents[${i}]`;
    if (!doc.fields || typeof doc.fields !== "object") {
      issues.push({ path: `${prefix}.fields`, message: "fields object is required." });
      return;
    }
    for (const [key, value] of Object.entries(doc.fields)) {
      if (!mappedKeys.has(key)) {
        if (!allowUnknown) {
          issues.push({
            path: `${prefix}.fields.${key}`,
            message: `Field "${key}" is not in the index mapping.`,
          });
        }
        continue;
      }
      issues.push(...checkField(`${prefix}.fields.${key}`, mappings[key]!, value));
    }
    if (doc.vector !== undefined) {
      const vectorField = Object.entries(mappings).find(([, m]) => m.type === "vector");
      if (!vectorField && !allowUnknown) {
        issues.push({
          path: `${prefix}.vector`,
          message: "Document has a vector but index mapping has no vector field / vectorDimensions.",
        });
      } else if (!Array.isArray(doc.vector) || !doc.vector.every((n) => typeof n === "number")) {
        issues.push({ path: `${prefix}.vector`, message: "vector must be number[]." });
      }
    }
  });

  return { ok: issues.length === 0, issues };
}
