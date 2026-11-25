"use server";

import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";
import { requestMeta } from "@/modules/auth/session";
import { addToCart, cartOwnerKey, CartError, loadCart, setCartQty } from "./data";
import { cleanItems, MAX_QTY, productIdSchema, qtySchema, variantIdSchema, type CartView } from "./logic";

/**
 * Cart actions for the store (FR-CO-01). Open to everyone, so: ids and quantities validated, products
 * checked to be on sale and in stock, writes rate limited per cart. Every action returns the whole cart
 * as the server sees it, so the browser never has to guess prices or stock.
 */

export type CartResult = { ok: true; cart: CartView; message?: string } | { ok: false; error: string };

const WRITES_PER_MINUTE = 60;

async function guarded(fn: () => Promise<{ cart: CartView; message?: string }>): Promise<CartResult> {
  try {
    const { ip } = await requestMeta();
    const limit = await rateLimit(redis(), `cart:${await cartOwnerKey(ip)}`, WRITES_PER_MINUTE, 60);
    if (!limit.allowed) return { ok: false, error: "Too many changes at once. Please wait a moment." };
    const res = await fn();
    return { ok: true, ...res };
  } catch (err) {
    if (err instanceof CartError) return { ok: false, error: err.message };
    logger.error({ err }, "cart action failed");
    return { ok: false, error: "Couldn't update your cart. Please try again." };
  }
}

/** The cart for this browser (see loadCart for what `local` is for). */
export async function loadCartAction(local: unknown): Promise<CartResult> {
  try {
    return { ok: true, cart: await loadCart(cleanItems(local)) };
  } catch (err) {
    if (err instanceof CartError) return { ok: false, error: err.message };
    logger.error({ err }, "cart load failed");
    return { ok: false, error: "Couldn't load your cart." };
  }
}

const addInput = z.union([
  z.object({ variantId: variantIdSchema, qty: qtySchema.default(1) }),
  z.object({ productId: productIdSchema, qty: qtySchema.default(1) }),
]);

export async function addToCartAction(raw: unknown): Promise<CartResult> {
  const p = addInput.safeParse(raw);
  if (!p.success) return { ok: false, error: "Please choose the options first." };
  const { qty, ...target } = p.data;
  return guarded(() => addToCart(target, qty));
}

const qtyInput = z.object({ variantId: variantIdSchema, qty: z.coerce.number().int().min(0).max(MAX_QTY) });

/** Sets a line's quantity; 0 removes the line. */
export async function setCartQtyAction(raw: unknown): Promise<CartResult> {
  const p = qtyInput.safeParse(raw);
  if (!p.success) return { ok: false, error: `Choose between 1 and ${MAX_QTY}.` };
  return guarded(() => setCartQty(p.data.variantId, p.data.qty));
}
