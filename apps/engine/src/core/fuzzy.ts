/**
 * Edit-distance helpers for fuzzy / wildcard matching.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]!;
  }
  return prev[b.length]!;
}

/** ES-like AUTO fuzziness. */
export function autoFuzziness(termLen: number): number {
  if (termLen <= 2) return 0;
  if (termLen <= 5) return 1;
  return 2;
}

export function resolveFuzziness(
  fuzziness: boolean | 0 | 1 | 2 | "AUTO" | undefined,
  termLen: number,
): number {
  if (fuzziness === false || fuzziness === undefined) return 0;
  if (fuzziness === true || fuzziness === "AUTO") return autoFuzziness(termLen);
  return fuzziness;
}

export function wildcardMatch(pattern: string, value: string): boolean {
  // Convert simple ? * glob to anchored regex
  let re = "^";
  for (const ch of pattern) {
    if (ch === "*") re += ".*";
    else if (ch === "?") re += ".";
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  re += "$";
  return new RegExp(re).test(value);
}
