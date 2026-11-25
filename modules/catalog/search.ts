/**
 * Product search (FR-SF-08): typo tolerance, match-as-you-type and Bangla, as pure functions so the
 * ranking can be unit-tested. The data side (search-data.ts) feeds it a cached list of Active products.
 *
 * How a query matches: it is split into words; every word must match some word of the product
 * (title, Bangla title, tags or category names). If no product matches every word, products matching
 * all but one are shown instead. A word matches exactly, as the start of a longer word
 * ("chop" → "chopper") or with a typo — 1 for words of 4–6 letters, 2 for longer ones ("chpper",
 * "blendr"). Title matches count double; a product whose title contains the whole phrase ranks higher.
 */

export const MAX_QUERY_LENGTH = 80;
const MAX_TOKENS = 6;

const STOP_WORDS = new Set(["a", "an", "and", "the", "for", "of", "with", "in", "to", "on", "by"]);

/**
 * Lower case, Latin accents removed, punctuation turned into spaces. Bangla letters and their vowel
 * signs are kept (they are combining marks, so only the Latin accent range is stripped).
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  return normalizeText(text).split(" ").filter(Boolean);
}

/** Query words to search for: unique, stop words dropped (unless that leaves nothing), at most 6. */
export function queryTokens(query: string): string[] {
  const all = [...new Set(tokenize(query.slice(0, MAX_QUERY_LENGTH)))];
  const useful = all.filter((t) => !STOP_WORDS.has(t));
  return (useful.length ? useful : all).slice(0, MAX_TOKENS);
}

/** Cleaned-up query, used as the cache key and shown back to the shopper. */
export function cleanQuery(query: string): string {
  return query.slice(0, MAX_QUERY_LENGTH).replace(/\s+/g, " ").trim();
}

/**
 * Edit distance with swaps of neighbouring letters counted as one edit ("cohpper" → "chopper" = 1).
 * Gives up early and returns `max + 1` once the distance is certainly above `max`.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a === b) return 0;
  const n = b.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n]!;
}

/** Typos allowed for a query word of this length. */
export function allowedTypos(length: number): number {
  return length <= 3 ? 0 : length <= 6 ? 1 : 2;
}

export type SearchWord = { w: string; weight: number };

/** How well one query word matches the best word of a document (0 = no match). */
export function wordScore(t: string, words: SearchWord[]): number {
  const maxTypos = allowedTypos([...t].length);
  let best = 0;
  for (const { w, weight } of words) {
    let s = 0;
    if (w === t) s = 3;
    else if (t.length >= 2 && w.startsWith(t)) s = 2.2;
    else if (maxTypos > 0) {
      const d = editDistance(t, w, maxTypos);
      if (d <= maxTypos) s = d === 1 ? 1.6 : 1.1;
      else if (w.length > t.length) {
        // A typo while still typing: compare with the start of the longer word ("chpp" → "chopper").
        const dp = editDistance(t, w.slice(0, t.length), Math.min(1, maxTypos));
        if (dp <= 1) s = 1.2;
      }
    }
    if (s * weight > best) best = s * weight;
    if (best >= 6) break; // exact title match, can't do better
  }
  return best;
}

export type SearchDoc = {
  id: string;
  /** Normalised words with their weight (title 2, others 1). */
  words: SearchWord[];
  /** Normalised title, for the whole-phrase bonus. */
  phrase: string;
  /** Tie-breaker: bigger first (best sellers, then newest). */
  rank: number;
};

/** Builds a document's words from its fields. Title words weigh double. */
export function searchWords(fields: { strong: string[]; weak: string[] }): SearchWord[] {
  const out = new Map<string, number>();
  for (const [texts, weight] of [
    [fields.strong, 2],
    [fields.weak, 1],
  ] as const) {
    for (const w of texts.flatMap(tokenize)) if ((out.get(w) ?? 0) < weight) out.set(w, weight);
  }
  return [...out].map(([w, weight]) => ({ w, weight }));
}

/** Matching document ids, best first. */
export function rankDocs(docs: SearchDoc[], query: string, limit = 500): { id: string; score: number }[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const phrase = normalizeText(query);
  const all: { id: string; score: number; rank: number }[] = [];
  const allButOne: typeof all = [];
  for (const d of docs) {
    let score = 0;
    let missed = 0;
    for (const t of tokens) {
      const s = wordScore(t, d.words);
      if (s === 0 && ++missed > 1) break;
      score += s;
    }
    if (missed > 1 || score === 0) continue;
    if (tokens.length > 1 && d.phrase.includes(phrase)) score += 2;
    (missed === 0 ? all : allButOne).push({ id: d.id, score, rank: d.rank });
  }
  // Every word must match; only when nothing does, show products that match all but one word
  // ("rice cokr" still finds rice cookers).
  const hits = all.length > 0 || tokens.length === 1 ? all : allButOne;
  hits.sort((a, b) => b.score - a.score || b.rank - a.rank);
  return hits.slice(0, limit).map(({ id, score }) => ({ id, score }));
}
