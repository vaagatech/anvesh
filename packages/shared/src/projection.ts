/**
 * MongoDB-style field projection & selection for Anvesh Search Documents & Hits.
 * VaagaTech · https://www.vaagatech.com
 */

export type ProjectionRule = number | boolean;

export interface SourceFilterObject {
  includes?: string[];
  excludes?: string[];
}

export type ProjectionSpec =
  | string[]
  | string
  | Record<string, ProjectionRule>
  | boolean
  | SourceFilterObject;

export interface NormalizedProjection {
  enabled: boolean;
  mode: "include" | "exclude";
  includeFields: Set<string>;
  excludeFields: Set<string>;
  includeGlobs: RegExp[];
  excludeGlobs: RegExp[];
  includeId: boolean;
  explicitIdHandled: boolean;
}

/**
 * Converts a glob pattern like "meta.*" or "user_*_id" or "title*" into a RegExp.
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

/**
 * Normalizes any projection input format (MongoDB object, array, comma-separated string,
 * Elasticsearch _source object, or boolean) into a unified NormalizedProjection.
 */
export function normalizeProjection(
  spec?: ProjectionSpec | null,
  extraIncludes?: string[],
  extraExcludes?: string[],
): NormalizedProjection | null {
  if (spec === undefined || spec === null) {
    if ((!extraIncludes || extraIncludes.length === 0) && (!extraExcludes || extraExcludes.length === 0)) {
      return null;
    }
  }

  let enabled = true;
  let includeId = true;
  let explicitIdHandled = false;

  const includeFields = new Set<string>();
  const excludeFields = new Set<string>();
  const includeGlobs: RegExp[] = [];
  const excludeGlobs: RegExp[] = [];

  if (typeof spec === "boolean") {
    if (!spec) {
      return {
        enabled: false,
        mode: "include",
        includeFields,
        excludeFields,
        includeGlobs,
        excludeGlobs,
        includeId: true,
        explicitIdHandled: false,
      };
    }
    return null;
  }

  // 1. String list (e.g. "title,url,price" or "title price")
  if (typeof spec === "string") {
    const tokens = spec
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const t of tokens) {
      if (t.startsWith("-") || t.startsWith("!")) {
        const clean = t.slice(1);
        if (clean === "id" || clean === "_id") {
          includeId = false;
          explicitIdHandled = true;
        } else if (clean.includes("*") || clean.includes("?")) {
          excludeGlobs.push(globToRegex(clean));
        } else {
          excludeFields.add(clean);
        }
      } else {
        if (t === "id" || t === "_id") {
          includeId = true;
          explicitIdHandled = true;
        } else if (t.includes("*") || t.includes("?")) {
          includeGlobs.push(globToRegex(t));
        } else {
          includeFields.add(t);
        }
      }
    }
  }

  // 2. Array of strings
  else if (Array.isArray(spec)) {
    for (const item of spec) {
      if (typeof item !== "string") continue;
      const t = item.trim();
      if (!t) continue;
      if (t.startsWith("-") || t.startsWith("!")) {
        const clean = t.slice(1);
        if (clean === "id" || clean === "_id") {
          includeId = false;
          explicitIdHandled = true;
        } else if (clean.includes("*") || clean.includes("?")) {
          excludeGlobs.push(globToRegex(clean));
        } else {
          excludeFields.add(clean);
        }
      } else {
        if (t === "id" || t === "_id") {
          includeId = true;
          explicitIdHandled = true;
        } else if (t.includes("*") || t.includes("?")) {
          includeGlobs.push(globToRegex(t));
        } else {
          includeFields.add(t);
        }
      }
    }
  }

  // 3. Elasticsearch _source object { includes?: string[], excludes?: string[] }
  else if (
    typeof spec === "object" &&
    spec !== null &&
    ("includes" in spec || "excludes" in spec) &&
    (Array.isArray((spec as SourceFilterObject).includes) || Array.isArray((spec as SourceFilterObject).excludes))
  ) {
    const s = spec as SourceFilterObject;
    if (s.includes) {
      for (const inc of s.includes) {
        if (inc === "id" || inc === "_id") {
          includeId = true;
          explicitIdHandled = true;
        } else if (inc.includes("*") || inc.includes("?")) {
          includeGlobs.push(globToRegex(inc));
        } else {
          includeFields.add(inc);
        }
      }
    }
    if (s.excludes) {
      for (const exc of s.excludes) {
        if (exc === "id" || exc === "_id") {
          includeId = false;
          explicitIdHandled = true;
        } else if (exc.includes("*") || exc.includes("?")) {
          excludeGlobs.push(globToRegex(exc));
        } else {
          excludeFields.add(exc);
        }
      }
    }
  }

  // 4. MongoDB Projection object: { [field: string]: 1 | 0 | true | false }
  else if (typeof spec === "object" && spec !== null) {
    for (const [key, val] of Object.entries(spec)) {
      const isInclude = val === 1 || val === true || val === "1" || val === "true";
      const isExclude = val === 0 || val === false || val === "0" || val === "false";

      if (key === "_id" || key === "id") {
        explicitIdHandled = true;
        includeId = isInclude;
        continue;
      }

      if (isInclude) {
        if (key.includes("*") || key.includes("?")) {
          includeGlobs.push(globToRegex(key));
        } else {
          includeFields.add(key);
        }
      } else if (isExclude) {
        if (key.includes("*") || key.includes("?")) {
          excludeGlobs.push(globToRegex(key));
        } else {
          excludeFields.add(key);
        }
      }
    }
  }

  // Merge extra includes / excludes if provided
  if (extraIncludes?.length) {
    for (const inc of extraIncludes) {
      if (inc === "id" || inc === "_id") {
        includeId = true;
        explicitIdHandled = true;
      } else if (inc.includes("*") || inc.includes("?")) {
        includeGlobs.push(globToRegex(inc));
      } else {
        includeFields.add(inc);
      }
    }
  }

  if (extraExcludes?.length) {
    for (const exc of extraExcludes) {
      if (exc === "id" || exc === "_id") {
        includeId = false;
        explicitIdHandled = true;
      } else if (exc.includes("*") || exc.includes("?")) {
        excludeGlobs.push(globToRegex(exc));
      } else {
        excludeFields.add(exc);
      }
    }
  }

  const hasInclusions = includeFields.size > 0 || includeGlobs.length > 0;
  const hasExclusions = excludeFields.size > 0 || excludeGlobs.length > 0;

  if (!hasInclusions && !hasExclusions && !explicitIdHandled) {
    return null;
  }

  const mode: "include" | "exclude" = hasInclusions ? "include" : "exclude";

  return {
    enabled,
    mode,
    includeFields,
    excludeFields,
    includeGlobs,
    excludeGlobs,
    includeId,
    explicitIdHandled,
  };
}

/**
 * Checks if a given field path matches inclusion or exclusion rules.
 */
function isFieldAllowed(
  fieldPath: string,
  normalized: NormalizedProjection,
): boolean {
  // If excluding
  if (normalized.excludeFields.has(fieldPath)) return false;
  for (const glob of normalized.excludeGlobs) {
    if (glob.test(fieldPath)) return false;
  }

  if (normalized.mode === "exclude") {
    return true;
  }

  // If including
  if (normalized.includeFields.has(fieldPath)) return true;
  for (const glob of normalized.includeGlobs) {
    if (glob.test(fieldPath)) return true;
  }

  // Check parent path for nested fields (e.g. if including "meta", then "meta.author" is allowed)
  const parts = fieldPath.split(".");
  let prefix = "";
  for (let i = 0; i < parts.length - 1; i++) {
    prefix = prefix ? `${prefix}.${parts[i]}` : parts[i]!;
    if (normalized.includeFields.has(prefix)) return true;
    for (const glob of normalized.includeGlobs) {
      if (glob.test(prefix)) return true;
    }
  }

  // Check if any subpath is included (e.g., if including "meta.author", then "meta" object must be traversed)
  const prefixDot = `${fieldPath}.`;
  for (const inc of normalized.includeFields) {
    if (inc.startsWith(prefixDot)) return true;
  }
  for (const glob of normalized.includeGlobs) {
    if (glob.test(`${fieldPath}.__subfield__`)) return true;
  }

  return false;
}

/**
 * Recursively projects an object or value based on normalized field rules.
 */
function projectNestedObject(
  obj: Record<string, any>,
  currentPath: string,
  normalized: NormalizedProjection,
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullPath = currentPath ? `${currentPath}.${key}` : key;

    // Check if the current full path is explicitly allowed or rejected
    if (!isFieldAllowed(fullPath, normalized)) {
      continue;
    }

    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      // Check if the entire object is included directly
      const isDirectlyIncluded =
        normalized.mode === "include" &&
        (normalized.includeFields.has(fullPath) ||
          normalized.includeGlobs.some((g) => g.test(fullPath)));

      if (isDirectlyIncluded) {
        // Include everything under this object except any sub-exclusions
        result[key] = filterExclusionsOnly(value, fullPath, normalized);
      } else {
        // Recurse to filter nested fields
        const sub = projectNestedObject(value, fullPath, normalized);
        if (Object.keys(sub).length > 0) {
          result[key] = sub;
        }
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * When a parent object is directly included, filter out any sub-exclusions.
 */
function filterExclusionsOnly(
  obj: Record<string, any>,
  currentPath: string,
  normalized: NormalizedProjection,
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = `${currentPath}.${key}`;
    if (normalized.excludeFields.has(fullPath)) continue;
    if (normalized.excludeGlobs.some((g) => g.test(fullPath))) continue;

    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      result[key] = filterExclusionsOnly(value, fullPath, normalized);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Projects an AnveshDocument according to the MongoDB-style projection spec.
 */
export function projectDocument<T extends { id?: string; fields?: Record<string, any>; meta?: Record<string, any>; [key: string]: any }>(
  doc: T,
  projection?: ProjectionSpec | null,
  extraIncludes?: string[],
  extraExcludes?: string[],
): T {
  const norm = normalizeProjection(projection, extraIncludes, extraExcludes);
  if (!norm) return doc;

  if (!norm.enabled) {
    // When projection is false / disabled, return only document identity if allowed
    const emptyResult: any = {};
    if (norm.includeId && doc.id !== undefined) {
      emptyResult.id = doc.id;
    }
    emptyResult.fields = {};
    return emptyResult as T;
  }

  const out: any = {};

  // 1. Handle document ID
  if (norm.includeId && doc.id !== undefined) {
    out.id = doc.id;
  }

  // 2. Project `fields`
  // Users may refer to fields either as "title" or "fields.title"
  if (doc.fields && typeof doc.fields === "object") {
    // Build a contextual normalizer that maps both "fieldName" and "fields.fieldName"
    const fieldsNorm: NormalizedProjection = {
      ...norm,
      includeFields: new Set<string>(),
      excludeFields: new Set<string>(),
      includeGlobs: [...norm.includeGlobs],
      excludeGlobs: [...norm.excludeGlobs],
    };

    for (const f of norm.includeFields) {
      if (f.startsWith("fields.")) {
        fieldsNorm.includeFields.add(f.slice("fields.".length));
      } else {
        fieldsNorm.includeFields.add(f);
      }
    }
    for (const f of norm.excludeFields) {
      if (f.startsWith("fields.")) {
        fieldsNorm.excludeFields.add(f.slice("fields.".length));
      } else {
        fieldsNorm.excludeFields.add(f);
      }
    }

    out.fields = projectNestedObject(doc.fields, "", fieldsNorm);
  } else {
    out.fields = {};
  }

  // 3. Project `meta`
  if (doc.meta && typeof doc.meta === "object") {
    if (norm.mode === "exclude") {
      // In exclude mode, meta is included unless meta or meta.* is excluded
      const metaExcluded = norm.excludeFields.has("meta") || norm.excludeGlobs.some((g) => g.test("meta"));
      if (!metaExcluded) {
        const metaNorm: NormalizedProjection = {
          ...norm,
          includeFields: new Set(),
          excludeFields: new Set(),
        };
        for (const f of norm.excludeFields) {
          if (f.startsWith("meta.")) {
            metaNorm.excludeFields.add(f.slice("meta.".length));
          }
        }
        out.meta = projectNestedObject(doc.meta, "", metaNorm);
      }
    } else {
      // In include mode, meta is only included if "meta" or "meta.*" was specified
      const metaIncluded =
        norm.includeFields.has("meta") ||
        norm.includeGlobs.some((g) => g.test("meta")) ||
        Array.from(norm.includeFields).some((f) => f.startsWith("meta.")) ||
        norm.includeGlobs.some((g) => g.test("meta.something"));

      if (metaIncluded) {
        const metaNorm: NormalizedProjection = {
          ...norm,
          includeFields: new Set(),
          excludeFields: new Set(),
        };
        for (const f of norm.includeFields) {
          if (f === "meta") {
            metaNorm.includeFields.add("*");
            metaNorm.includeGlobs.push(/^.*$/);
          } else if (f.startsWith("meta.")) {
            metaNorm.includeFields.add(f.slice("meta.".length));
          }
        }
        for (const f of norm.excludeFields) {
          if (f.startsWith("meta.")) {
            metaNorm.excludeFields.add(f.slice("meta.".length));
          }
        }
        out.meta = projectNestedObject(doc.meta, "", metaNorm);
      }
    }
  }

  // 4. Retain other non-vector top-level properties if in exclude mode or explicitly included
  for (const [k, v] of Object.entries(doc)) {
    if (k === "id" || k === "fields" || k === "meta" || k === "vector") continue;
    if (norm.mode === "exclude") {
      if (!norm.excludeFields.has(k) && !norm.excludeGlobs.some((g) => g.test(k))) {
        out[k] = v;
      }
    } else {
      if (norm.includeFields.has(k) || norm.includeGlobs.some((g) => g.test(k))) {
        out[k] = v;
      }
    }
  }

  return out as T;
}
