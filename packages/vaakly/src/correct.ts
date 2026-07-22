/**
 * Correct user-facing summary sentences — plurals, empty counts, tone.
 * Heuristic only (no ML).
 */

export interface CorrectSummaryInput {
  message: string;
  code?: string;
  total?: number;
  count?: number;
  tookMs?: number;
  indexed?: number;
  failed?: number;
  vars?: Record<string, string | number | boolean | undefined | null>;
}

function plural(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? singular : (pluralForm ?? `${singular}s`);
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return undefined;
}

/**
 * Rewrite a draft API summary into clear English.
 * Prefer structured rebuilds when `code` + counts are known.
 */
export function correctSummary(input: CorrectSummaryInput): string {
  const vars = input.vars ?? {};
  const total = num(input.total ?? vars.total);
  const count = num(input.count ?? vars.count);
  const tookMs = num(input.tookMs ?? vars.tookMs);
  const indexed = num(input.indexed ?? vars.indexed);
  const failed = num(input.failed ?? vars.failed);
  const code = input.code;

  if (code === "OK_SEARCH" && total !== undefined) {
    const timing = tookMs !== undefined ? ` in ${tookMs}ms` : "";
    if (total === 0) return `Search completed. No matching documents found${timing}.`;
    return `Search completed. Found ${total} matching ${plural(total, "document")}${timing}.`;
  }

  if (code === "OK_INDEX_LISTED" && count !== undefined) {
    return `Retrieved ${count} ${plural(count, "index", "indexes")}.`;
  }

  if (code === "OK_BULK" && indexed !== undefined && failed !== undefined) {
    if (failed === 0) return `Bulk indexing finished: ${indexed} ${plural(indexed, "document")} indexed.`;
    return `Bulk indexing finished: ${indexed} indexed, ${failed} failed.`;
  }

  let out = input.message ?? "";

  // Fix legacy "document(s)" / "index(es)" style
  out = out.replace(
    /(\d+)\s+matching document\(s\)/gi,
    (_, n: string) => {
      const v = Number(n);
      return `${v} matching ${plural(v, "document")}`;
    },
  );
  out = out.replace(
    /Retrieved (\d+) index\(es\)/gi,
    (_, n: string) => {
      const v = Number(n);
      return `Retrieved ${v} ${plural(v, "index", "indexes")}`;
    },
  );
  out = out.replace(/\b0 matching documents?\b/gi, "no matching documents");

  // Singular template left with count ≠ 1
  out = out.replace(
    /Found (\d+) matching document(?!s)\b/gi,
    (_, n: string) => {
      const v = Number(n);
      return `Found ${v} matching ${plural(v, "document")}`;
    },
  );
  out = out.replace(
    /Retrieved (\d+) index(?!e)/gi,
    (_, n: string) => {
      const v = Number(n);
      return `Retrieved ${v} ${plural(v, "index", "indexes")}`;
    },
  );

  // Strip unfilled placeholders and tidy whitespace
  out = out.replace(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, "");
  out = out.replace(/\s{2,}/g, " ").replace(/\s+\./g, ".").trim();
  return out;
}
