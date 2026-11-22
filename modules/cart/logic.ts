import { z } from "zod";
import type { CartLine, CartView, VariantFacts } from "./view";

export { EMPTY_CART, freeDeliveryGap, type CartLine, type CartView, type VariantFacts } from "./view";

/**
 * The cart (FR-CO-01). Pure and browser-safe: the server keeps the cart, the browser keeps a copy for an
 * instant header badge and to restore a guest cart whose cookie was lost. Prices, stock and weights are
 * always read fresh on the server; the stored cart holds only which variant and how many.
 */

/** Most of one variant a shopper can put in the cart (matches the quantity picker). */
export const MAX_QTY = 10;
/** Most different products in one cart. */
export const MAX_LINES = 50;

export type CartItem = { variantId: string; qty: number };

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
export const qtySchema = z.coerce.number().int().min(1).max(MAX_QTY);
export const variantIdSchema = objectId;
export const productIdSchema = objectId;

/** Items sent from the browser's copy: anything malformed is dropped, not rejected. */
export function cleanItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CartItem[] = [];
  for (const r of raw.slice(0, MAX_LINES * 2)) {
    if (!r || typeof r !== "object") continue;
    const id = objectId.safeParse((r as { variantId?: unknown }).variantId);
    const qty = Number((r as { qty?: unknown }).qty);
    if (!id.success || !Number.isInteger(qty) || qty < 1) continue;
    out.push({ variantId: id.data.toLowerCase(), qty: Math.min(qty, MAX_QTY) });
  }
  return mergeItems([], out);
}

/** Adds `qty` of a variant (to an existing line if there is one). */
export function addItem(items: CartItem[], variantId: string, qty: number): CartItem[] {
  const i = items.findIndex((x) => x.variantId === variantId);
  if (i >= 0) {
    return items.map((x, j) => (j === i ? { ...x, qty: Math.min(MAX_QTY, x.qty + qty) } : x));
  }
  return [...items, { variantId, qty: Math.min(MAX_QTY, qty) }];
}

/** Sets a line's quantity; 0 removes it. */
export function setItemQty(items: CartItem[], variantId: string, qty: number): CartItem[] {
  if (qty <= 0) return items.filter((x) => x.variantId !== variantId);
  return items.map((x) => (x.variantId === variantId ? { ...x, qty: Math.min(MAX_QTY, qty) } : x));
}

/** A guest cart joining an account cart on sign-in: same variants add up (to the maximum). */
export function mergeItems(into: CartItem[], from: CartItem[]): CartItem[] {
  let items = into;
  for (const x of from) {
    if (items.length >= MAX_LINES && !items.some((y) => y.variantId === x.variantId)) continue;
    items = addItem(items, x.variantId, x.qty);
  }
  return items;
}

// ---------- What the shopper sees (in view.ts, which the browser loads without zod) ----------

/** Builds the cart from stored items and current variant facts. Gone variants are left out. */
export function buildCart(
  items: CartItem[],
  facts: Map<string, VariantFacts>,
  extra: { freeAbove: number | null; signedIn: boolean },
): CartView {
  const lines: CartLine[] = [];
  for (const it of items) {
    const f = facts.get(it.variantId);
    if (!f) continue;
    const { sellable, ...rest } = f;
    const maxQty = sellable ? Math.min(MAX_QTY, f.available) : 0;
    const problem: CartLine["problem"] = !sellable
      ? "unavailable"
      : f.available <= 0
        ? "soldOut"
        : it.qty > maxQty
          ? "tooMany"
          : null;
    lines.push({ ...rest, variantId: it.variantId, qty: it.qty, maxQty, problem });
  }
  const ok = lines.filter((l) => l.problem === null);
  return {
    lines,
    count: lines.reduce((n, l) => n + l.qty, 0),
    subtotal: ok.reduce((n, l) => n + l.price * l.qty, 0),
    weightGrams: ok.reduce((n, l) => n + l.weightGrams * l.qty, 0),
    freeAbove: extra.freeAbove,
    hasProblems: lines.length !== ok.length,
    signedIn: extra.signedIn,
  };
}
