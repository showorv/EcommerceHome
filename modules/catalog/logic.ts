/**
 * Pure catalogue logic (no I/O) so it can be unit-tested and reused on server and client.
 * All money values are integer poisha.
 */

// ---------- Slugs ----------

/** "Mini Electric Chopper 2L!" → "mini-electric-chopper-2l". Non-Latin text (e.g. Bangla) is dropped. */
export function slugify(text: string, maxLength = 80): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Returns `base`, or `base-2`, `base-3`… — the first one `taken` says is free. */
export async function uniqueSlug(base: string, taken: (slug: string) => Promise<boolean>): Promise<string> {
  const root = base || "item";
  if (!(await taken(root))) return root;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${root}-${i}`;
    if (!(await taken(candidate))) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

// ---------- Landed cost (FR-AD-04) ----------

export type BatchLine = { qty: number; unitCost: number };

/**
 * Spreads extra costs (shipping, customs, other) over the lines in proportion to their goods value
 * (qty × unitCost). Falls back to proportion by quantity when every unit cost is 0.
 * Returns the landed cost per unit for each line; the rounding remainder goes to the largest line
 * so the total always matches exactly.
 */
export function allocateLandedCost(
  lines: BatchLine[],
  extraCost: number,
): { landedUnitCost: number; landedTotal: number }[] {
  if (lines.length === 0) return [];
  const values = lines.map((l) => l.qty * l.unitCost);
  const goods = values.reduce((a, b) => a + b, 0);
  const weights = goods > 0 ? values : lines.map((l) => l.qty);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const shares = weights.map((w) => Math.floor((extraCost * w) / weightSum));
  const remainder = extraCost - shares.reduce((a, b) => a + b, 0);
  const biggest = weights.indexOf(Math.max(...weights));
  shares[biggest] = (shares[biggest] ?? 0) + remainder;

  return lines.map((l, i) => {
    const landedTotal = (values[i] ?? 0) + (shares[i] ?? 0);
    return { landedTotal, landedUnitCost: Math.round(landedTotal / l.qty) };
  });
}

/** Weighted average cost after receiving `qty` units at `unitCost`. Negative stock counts as 0. */
export function weightedAverageCost(currentStock: number, currentCost: number, qty: number, unitCost: number): number {
  const base = Math.max(0, currentStock);
  if (base + qty <= 0) return unitCost;
  return Math.round((base * currentCost + qty * unitCost) / (base + qty));
}

// ---------- Variants ----------

export type OptionDef = { name: string; values: string[] };

/** All combinations of option values: [{Colour: Red, Size: S}, {Colour: Red, Size: M}, …]. */
export function variantCombinations(options: OptionDef[]): Record<string, string>[] {
  const usable = options.filter((o) => o.name.trim() && o.values.some((v) => v.trim()));
  if (usable.length === 0) return [{}];
  return usable.reduce<Record<string, string>[]>(
    (acc, opt) =>
      acc.flatMap((combo) =>
        opt.values.filter((v) => v.trim()).map((v) => ({ ...combo, [opt.name.trim()]: v.trim() })),
      ),
    [{}],
  );
}

export function variantTitle(options: Record<string, string>, optionNames: string[]): string {
  return optionNames
    .map((n) => options[n])
    .filter(Boolean)
    .join(" / ");
}

/** Suggests a SKU like "CHOP-RED-XL" from a product slug and option values. */
export function suggestSku(productSlug: string, options: Record<string, string>): string {
  const head = productSlug
    .split("-")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.slice(0, 4))
    .join("-");
  const tail = Object.values(options).map((v) => slugify(v).slice(0, 6));
  return [head, ...tail].filter(Boolean).join("-").toUpperCase() || "SKU";
}

export type VariantSummary = {
  price: number;
  compareAtPrice: number;
  stock: number;
  reserved: number;
  active: boolean;
};

/** Product-level numbers derived from its variants (for cards, filters and sorting). */
export function summariseVariants(variants: VariantSummary[]) {
  const live = variants.filter((v) => v.active);
  if (live.length === 0) {
    return {
      priceMin: 0,
      priceMax: 0,
      compareAtMax: 0,
      compareAtFrom: 0,
      maxDiscount: 0,
      totalStock: 0,
      inStock: false,
      onSale: false,
      variantCount: 0,
    };
  }
  const prices = live.map((v) => v.price);
  const priceMin = Math.min(...prices);
  const available = live.map((v) => Math.max(0, v.stock - v.reserved));
  const totalStock = available.reduce((a, b) => a + b, 0);
  return {
    priceMin,
    priceMax: Math.max(...prices),
    compareAtMax: Math.max(...live.map((v) => v.compareAtPrice)),
    // The card shows "৳price  ̶৳compareAt" for the cheapest variant, so the struck price must be that variant's own.
    compareAtFrom: Math.max(...live.filter((v) => v.price === priceMin).map((v) => v.compareAtPrice)),
    maxDiscount: Math.max(...live.map((v) => discountPercent(v.price, v.compareAtPrice))),
    totalStock,
    inStock: totalStock > 0,
    onSale: live.some((v) => v.compareAtPrice > v.price),
    variantCount: live.length,
  };
}

/** Colour values are compared in lower case with single spaces ("Sky  Blue" → "sky blue"). */
export function colourKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Option names treated as colour for the colour filter (FR-SF-07). */
export const COLOUR_OPTION_RE = /^(colou?r|রং|রঙ)$/i;

/**
 * Colour values offered by a product's active variants, in lower case ("Sky Blue" → "sky blue"),
 * for the colour filter on listing pages.
 */
export function productColours(variants: { options: Record<string, string>; active: boolean }[]): string[] {
  const out = new Set<string>();
  for (const v of variants) {
    if (!v.active) continue;
    for (const [name, value] of Object.entries(v.options)) {
      const key = colourKey(value);
      if (COLOUR_OPTION_RE.test(name.trim()) && key) out.add(key.slice(0, 30));
    }
  }
  return [...out].sort();
}

/** Stock badge for cards: "Sold out", or "Only N left" at or below the low-stock threshold (FR-PC-01). */
export function stockBadge(
  available: number,
  lowStockAt: number,
): { kind: "soldOut" } | { kind: "low"; left: number } | null {
  if (available <= 0) return { kind: "soldOut" };
  if (lowStockAt > 0 && available <= lowStockAt) return { kind: "low", left: available };
  return null;
}

/** "−25%" badge value; 0 when there is no real discount. */
export function discountPercent(price: number, compareAt: number): number {
  if (!compareAt || compareAt <= price) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

// ---------- Rule-based collections (FR-AD-03) ----------

export type CollectionRule =
  | { field: "price"; op: "lt" | "lte" | "gt" | "gte"; value: number }
  | { field: "category"; op: "in"; value: string[] }
  | { field: "tag"; op: "in"; value: string[] }
  | { field: "label"; op: "in"; value: string[] }
  | { field: "inStock"; op: "eq"; value: boolean }
  | { field: "onSale"; op: "eq"; value: boolean };

/**
 * Turns collection rules into a plain description of a product filter. The caller converts it into a
 * MongoDB query (see catalog.ts) so this stays free of database types and is easy to test.
 */
export function rulesToFilter(rules: CollectionRule[], match: "all" | "any") {
  const parts = rules.map((r) => {
    switch (r.field) {
      case "price":
        return { priceMin: { [`$${r.op}`]: r.value } };
      case "category":
        return { categoryIds: { $in: r.value } };
      case "tag":
        return { tags: { $in: r.value } };
      case "label":
        return { labels: { $in: r.value } };
      case "inStock":
        return { inStock: r.value };
      case "onSale":
        return { onSale: r.value };
    }
  });
  if (parts.length === 0) return null; // a rule collection with no rules matches nothing
  if (parts.length === 1) return parts[0];
  return match === "all" ? { $and: parts } : { $or: parts };
}

/** Same rules, checked against one product in memory (used for previews and tests). */
export function productMatchesRules(
  p: { priceMin: number; categoryIds: string[]; tags: string[]; labels: string[]; inStock: boolean; onSale: boolean },
  rules: CollectionRule[],
  match: "all" | "any",
): boolean {
  if (rules.length === 0) return false;
  const test = (r: CollectionRule) => {
    switch (r.field) {
      case "price":
        return {
          lt: p.priceMin < r.value,
          lte: p.priceMin <= r.value,
          gt: p.priceMin > r.value,
          gte: p.priceMin >= r.value,
        }[r.op];
      case "category":
        return r.value.some((id) => p.categoryIds.includes(id));
      case "tag":
        return r.value.some((t) => p.tags.includes(t));
      case "label":
        return r.value.some((l) => p.labels.includes(l));
      case "inStock":
        return p.inStock === r.value;
      case "onSale":
        return p.onSale === r.value;
    }
  };
  return match === "all" ? rules.every(test) : rules.some(test);
}
