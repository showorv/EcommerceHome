/**
 * Category and collection listings (FR-SF-07): reading filters from the URL, writing them back,
 * sort orders and "load more" cursors. Pure functions with no database types, safe on server and client.
 *
 * URL parameters (all optional):
 *   sort=newest|bestselling|price-asc|price-desc|discount|featured
 *   min=500&max=2000      price range in taka
 *   colour=red&colour=blue
 *   cat=blenders          sub-category (category pages) or category (collection pages), repeatable
 *   stock=1               in stock only
 *   rating=4              4 stars and up
 *   page=2                numbered pages
 * Anything that doesn't parse is ignored, so an old or hand-edited link never breaks the page.
 */

import { colourKey } from "./logic";

export const PAGE_SIZE = 24;
export const MAX_PAGE = 100; // deeper than this people use filters; keeps database skips small

export const LISTING_SORTS = [
  "relevance",
  "featured",
  "newest",
  "bestselling",
  "price-asc",
  "price-desc",
  "discount",
] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

export const SORT_LABELS: Record<ListingSort, string> = {
  relevance: "Best match",
  featured: "Featured",
  newest: "Newest",
  bestselling: "Best selling",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  discount: "Biggest discount",
};

export type ListingQuery = {
  sort: ListingSort | null; // null = the page's default order
  min: number | null; // poisha
  max: number | null; // poisha
  colours: string[]; // lowercase
  cats: string[]; // category slugs
  inStock: boolean;
  rating: 0 | 3 | 4;
  page: number;
};

export const EMPTY_QUERY: ListingQuery = {
  sort: null,
  min: null,
  max: null,
  colours: [],
  cats: [],
  inStock: false,
  rating: 0,
  page: 1,
};

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function all(sp: RawParams, key: string): string[] {
  if (sp instanceof URLSearchParams) return sp.getAll(key);
  const v = sp[key];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}
const first = (sp: RawParams, key: string) => all(sp, key)[0];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOUR_RE = /^[\p{L}\p{N}][\p{L}\p{N} -]{0,29}$/u;

export { colourKey };

/** "sky blue" → "Sky Blue" for display. */
export function colourLabel(key: string): string {
  return key.replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

function taka(v: string | undefined): number | null {
  if (!v || !/^\d{1,7}$/.test(v)) return null;
  return Number(v) * 100;
}

function uniq(values: string[], max: number) {
  return [...new Set(values)].slice(0, max);
}

export function parseListingParams(sp: RawParams): ListingQuery {
  const sort = first(sp, "sort");
  let min = taka(first(sp, "min"));
  let max = taka(first(sp, "max"));
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  const page = Number(first(sp, "page"));
  const rating = Number(first(sp, "rating"));
  return {
    sort: (LISTING_SORTS as readonly string[]).includes(sort ?? "") ? (sort as ListingSort) : null,
    min: min === 0 ? null : min,
    max,
    colours: uniq(
      all(sp, "colour")
        .map(colourKey)
        .filter((c) => COLOUR_RE.test(c)),
      10,
    ),
    cats: uniq(
      all(sp, "cat").filter((c) => c.length <= 120 && SLUG_RE.test(c)),
      10,
    ),
    inStock: first(sp, "stock") === "1",
    rating: rating === 4 || rating === 3 ? rating : 0,
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/**
 * Query string for a listing, always in the same order (so links and cache entries match).
 * `defaultSort` is left out of the URL.
 */
export function listingSearch(q: ListingQuery, defaultSort?: ListingSort): string {
  const sp = new URLSearchParams();
  if (q.sort && q.sort !== defaultSort) sp.set("sort", q.sort);
  if (q.min !== null) sp.set("min", String(Math.round(q.min / 100)));
  if (q.max !== null) sp.set("max", String(Math.round(q.max / 100)));
  for (const c of [...q.colours].sort()) sp.append("colour", c);
  for (const c of [...q.cats].sort()) sp.append("cat", c);
  if (q.inStock) sp.set("stock", "1");
  if (q.rating) sp.set("rating", String(q.rating));
  if (q.page > 1) sp.set("page", String(q.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Joins a page address (which may already have `?q=…`, e.g. search) with a listing query string. */
export function withSearch(basePath: string, search: string): string {
  return search && basePath.includes("?") ? `${basePath}&${search.slice(1)}` : basePath + search;
}

/** Number of filters in use (sort and page don't count). */
export function activeFilterCount(q: ListingQuery): number {
  return (
    (q.min !== null || q.max !== null ? 1 : 0) +
    q.colours.length +
    q.cats.length +
    (q.inStock ? 1 : 0) +
    (q.rating ? 1 : 0)
  );
}

/** Same filters with every one removed (keeps the sort). */
export function clearFilters(q: ListingQuery): ListingQuery {
  return { ...EMPTY_QUERY, sort: q.sort };
}

/** Page numbers to show: always the first and last, two either side of the current one, gaps as null. */
export function pageWindow(page: number, pages: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 2) out.push(p);
    else if (out[out.length - 1] !== null) out.push(null);
  }
  return out;
}

// ---------- Database query parts (plain objects; the caller turns ids into ObjectIds) ----------

/**
 * Match conditions for the filters. `catIds` is every category id the chosen `cat` slugs cover
 * (including their sub-categories), already resolved by the caller.
 */
export function filterConditions<Id>(q: ListingQuery, catIds: Id[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  if (q.min !== null || q.max !== null) {
    out.push({
      priceMin: { ...(q.min !== null ? { $gte: q.min } : {}), ...(q.max !== null ? { $lte: q.max } : {}) },
    });
  }
  if (q.colours.length) out.push({ colours: { $in: q.colours } });
  if (q.cats.length) out.push({ categoryIds: { $in: catIds } });
  if (q.inStock) out.push({ inStock: true });
  if (q.rating) out.push({ ratingAvg: { $gte: q.rating } });
  return out;
}

export type SortKey = [field: string, dir: 1 | -1];

/**
 * Sort keys, always ending in `_id` so the order is stable and a cursor can continue from any card.
 * `_pub` (publish date, falling back to creation date) and `_pos` (hand-picked position, or search
 * rank) are added by the query.
 */
export const SORT_KEYS: Record<ListingSort, SortKey[]> = {
  relevance: [
    ["_pos", 1],
    ["_id", 1],
  ],
  featured: [
    ["_pos", 1],
    ["_id", 1],
  ],
  newest: [
    ["_pub", -1],
    ["_id", -1],
  ],
  bestselling: [
    ["sortScore", -1],
    ["_pub", -1],
    ["_id", -1],
  ],
  "price-asc": [
    ["priceMin", 1],
    ["_id", -1],
  ],
  "price-desc": [
    ["priceMin", -1],
    ["_id", -1],
  ],
  discount: [
    ["maxDiscount", -1],
    ["_id", -1],
  ],
};

/**
 * "Everything after this card" for keyset pagination: for keys (a, b, _id) and the last card's values
 * (A, B, I) that is  a after A  OR  (a = A and b after B)  OR  (a = A and b = B and _id after I).
 */
export function keysetMatch(keys: SortKey[], values: unknown[]): Record<string, unknown> {
  const or = keys.map(([field, dir], i) => {
    const cond: Record<string, unknown> = {};
    for (let j = 0; j < i; j++) cond[keys[j]![0]] = values[j];
    cond[field] = { [dir === 1 ? "$gt" : "$lt"]: values[i] };
    return cond;
  });
  return or.length === 1 ? or[0]! : { $or: or };
}

/** Opaque "load more" cursor: the sort values of the last card shown. */
export function encodeCursor(values: (string | number)[]): string {
  const json = JSON.stringify(values);
  return typeof btoa === "function"
    ? btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    : Buffer.from(json).toString("base64url");
}

/**
 * Reads a cursor back for the given sort and checks every value's type, so a tampered cursor can only
 * ever be rejected. Dates come back as ISO strings and ids as hex strings; the caller converts them.
 */
export function decodeCursor(cursor: string, sort: ListingSort): (string | number)[] | null {
  if (!cursor || cursor.length > 300 || !/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
  let values: unknown;
  try {
    const b64 = cursor.replace(/-/g, "+").replace(/_/g, "/");
    values = JSON.parse(typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString());
  } catch {
    return null;
  }
  const keys = SORT_KEYS[sort];
  if (!Array.isArray(values) || values.length !== keys.length) return null;
  const ok = keys.every(([field], i) => {
    const v = values[i];
    if (field === "_id") return typeof v === "string" && /^[a-f0-9]{24}$/.test(v);
    if (field === "_pub") return typeof v === "string" && !Number.isNaN(Date.parse(v));
    return typeof v === "number" && Number.isFinite(v);
  });
  return ok ? (values as (string | number)[]) : null;
}
