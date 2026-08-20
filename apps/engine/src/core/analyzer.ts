export function splitCompound(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[-_.]+/g, " ");
}

/**
 * Lightweight English analyzer: normalize, tokenize, stopword filter, stem.
 * Designed for Lambda memory budgets — no native deps.
 */

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "if", "in",
  "into", "is", "it", "no", "not", "of", "on", "or", "such", "that", "the",
  "their", "then", "there", "these", "they", "this", "to", "was", "will", "with",
  "from", "have", "has", "had", "were", "been", "being", "do", "does", "did",
  "can", "could", "should", "would", "may", "might", "must", "shall", "your",
  "you", "we", "our", "us", "i", "me", "my", "he", "she", "him", "her", "his",
]);

/** Porter-like light stemmer (suffix stripping only). */
export function stem(token: string): string {
  let w = token;
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) w = w.slice(0, -3) + "y";
  else if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("ss")) return w;
  else if (w.endsWith("s") && !w.endsWith("us") && !w.endsWith("is")) w = w.slice(0, -1);
  if (w.endsWith("ing") && w.length > 5) {
    w = w.slice(0, -3);
    // running → runn → run; stopping → stopp → stop
    if (w.length >= 3 && w[w.length - 1] === w[w.length - 2] && !"aeiou".includes(w[w.length - 1]!)) {
      w = w.slice(0, -1);
    }
  } else if (w.endsWith("ed") && w.length > 4) {
    w = w.slice(0, -2);
    if (w.length >= 3 && w[w.length - 1] === w[w.length - 2] && !"aeiou".includes(w[w.length - 1]!)) {
      w = w.slice(0, -1);
    }
  }
  if (w.endsWith("ly") && w.length > 4) w = w.slice(0, -2);
  if (w.endsWith("tion") && w.length > 6) w = w.slice(0, -4) + "t";
  return w;
}

export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function tokenize(text: string, options?: { stopwords?: boolean; stemming?: boolean }): string[] {
  const useStop = options?.stopwords !== false;
  const useStem = options?.stemming !== false;
  const normalized = normalize(text);
  const raw = normalized.match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) ?? [];
  const out: string[] = [];
  for (const t of raw) {
    if (useStop && STOPWORDS.has(t)) continue;
    if (t.length < 2) continue;
    out.push(useStem ? stem(t) : t);
  }
  return out;
}

export function fieldToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(fieldToText).join(" ");
  if (typeof value === "object") return Object.values(value).map(fieldToText).join(" ");
  return "";
}

export interface Analyzer {
  name: string;
  analyze(text: string): string[];
}

export const standardAnalyzer: Analyzer = {
  name: "standard",
  analyze: (text) => tokenize(text, { stopwords: true, stemming: true }),
};

export const keywordAnalyzer: Analyzer = {
  name: "keyword",
  analyze: (text) => {
    const n = normalize(text).trim();
    return n ? [n] : [];
  },
};

export function getAnalyzer(name?: string): Analyzer {
  if (name === "keyword") return keywordAnalyzer;
  return standardAnalyzer;
}
