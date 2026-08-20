import { removeStopwords, eng } from "stopword";
import natural from "natural";

export function splitCompound(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[-_.]+/g, " ");
}

/**
 * Lightweight English analyzer: normalize, tokenize, stopword filter, stem.
 * Now using robust NLP libraries (`stopword` and `natural`).
 */

/** Porter stemmer via natural library. */
export function stem(token: string): string {
  return natural.PorterStemmer.stem(token);
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
  
  let tokens: string[] = Array.from(raw);
  if (useStop) {
    tokens = removeStopwords(tokens, eng);
  }
  
  const out: string[] = [];
  for (const t of tokens) {
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
