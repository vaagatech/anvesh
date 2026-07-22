/**
 * Shared FieldMapping shape (kept local so shared stays engine-agnostic).
 */
export interface FieldMapping {
  type: "text" | "keyword" | "number" | "boolean" | "date" | "vector" | "geo_point";
  store?: boolean;
  index?: boolean;
  analyzer?: string;
}
