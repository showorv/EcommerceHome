"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";
import { requestMeta } from "@/modules/auth/session";
import { addLinesToCart, CartError } from "@/modules/cart/data";
import type { CartView } from "@/modules/cart/logic";
import {
  addressFieldErrors,
  addressInput,
  TRACK_LIMITS,
  TRACK_NOT_FOUND,
  trackInput,
  type AddressField,
  type SavedAddress,
} from "./account";
import {
  AccountError,
  currentCustomer,
  deleteAddress,
  listAddresses,
  makeDefault,
  reorderLines,
  saveAddress,
  setWishlisted,
  trackOrder,
  wishlistIds,
  type Customer,
} from "./data";
import type { CustomerOrder } from "./order-view";

/**
 * The account area's actions (FR-AC-06/07). Every one finds the customer from the session itself, and
 * writes are rate limited per customer; tracking is limited per IP and per order number.
 */

const SIGNED_OUT = "Please sign in again.";
const objectId = z.string().regex(/^[a-f0-9]{24}$/i);

type Fail = { ok: false; error: string; signIn?: true };

async function withCustomer<T>(kind: string, perMinute: number, fn: (c: Customer) => Promise<T>): Promise<T | Fail> {
  try {
    const c = await currentCustomer();
    if (!c) return { ok: false, error: SIGNED_OUT, signIn: true };
    const limit = await rateLimit(redis(), `account:${kind}:${c.id}`, perMinute, 60);
    if (!limit.allowed) return { ok: false, error: "Too many changes at once. Please wait a moment." };
    return await fn(c);
  } catch (err) {
    if (err instanceof AccountError || err instanceof CartError) return { ok: false, error: err.message };
    logger.error({ err, kind }, "account action failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

// ---------- Addresses ----------

export type AddressResult =
  | { ok: true; addresses: SavedAddress[]; message?: string }
  | (Fail & { fields?: Partial<Record<AddressField, string>> });

const saveInput = z.object({ id: objectId.nullable().default(null), address: z.unknown() });

export async function saveAddressAction(raw: unknown): Promise<AddressResult> {
  const p = saveInput.safeParse(raw);
  if (!p.success) return { ok: false, error: "Please reload the page and try again." };
  const a = addressInput.safeParse(p.data.address);
  if (!a.success)
    return { ok: false, error: "Please check the highlighted fields.", fields: addressFieldErrors(a.error) };
  return withCustomer("address", 30, async (c) => {
    await saveAddress(c.id, p.data.id, a.data);
    revalidatePath("/account/addresses");
    return { ok: true as const, addresses: await listAddresses(c.id), message: "Address saved." };
  });
}

export async function deleteAddressAction(raw: unknown): Promise<AddressResult> {
  const p = z.object({ id: objectId }).safeParse(raw);
  if (!p.success) return { ok: false, error: "Please reload the page and try again." };
  return withCustomer("address", 30, async (c) => {
    await deleteAddress(c.id, p.data.id);
    return { ok: true as const, addresses: await listAddresses(c.id), message: "Address removed." };
  });
}

export async function defaultAddressAction(raw: unknown): Promise<AddressResult> {
  const p = z.object({ id: objectId }).safeParse(raw);
  if (!p.success) return { ok: false, error: "Please reload the page and try again." };
  return withCustomer("address", 30, async (c) => {
    await makeDefault(c.id, p.data.id);
    return { ok: true as const, addresses: await listAddresses(c.id), message: "Default address changed." };
  });
}

/** Saved addresses for the checkout's "Deliver to" picker; empty when signed out. */
export async function myAddressesAction(): Promise<SavedAddress[]> {
  try {
    const c = await currentCustomer();
    return c ? await listAddresses(c.id) : [];
  } catch (err) {
    logger.error({ err }, "loading addresses failed");
    return [];
  }
}

// ---------- Order again ----------

export type ReorderResult = { ok: true; cart: CartView; added: number; skipped: string[] } | Fail;

export async function reorderAction(raw: unknown): Promise<ReorderResult> {
  const p = z.object({ orderNo: z.string().regex(/^SR\d{5,9}$/) }).safeParse(raw);
  if (!p.success) return { ok: false, error: "Please reload the page and try again." };
  return withCustomer("reorder", 20, async (c) => {
    const lines = await reorderLines(c, p.data.orderNo);
    if (!lines) return { ok: false as const, error: "This order isn't in your account." };
    const res = await addLinesToCart(lines);
    return { ok: true as const, cart: res.cart, added: res.added, skipped: res.skipped };
  });
}

// ---------- Wishlist ----------

export type WishlistState = { signedIn: boolean; ids: string[] };

export async function wishlistStateAction(): Promise<WishlistState> {
  try {
    const c = await currentCustomer();
    return c ? { signedIn: true, ids: await wishlistIds(c.id) } : { signedIn: false, ids: [] };
  } catch (err) {
    logger.error({ err }, "loading wishlist failed");
    return { signedIn: false, ids: [] };
  }
}

export type WishlistResult = { ok: true; ids: string[] } | Fail;

export async function setWishlistAction(raw: unknown): Promise<WishlistResult> {
  const p = z.object({ productId: objectId, on: z.boolean() }).safeParse(raw);
  if (!p.success) return { ok: false, error: "Please reload the page and try again." };
  return withCustomer("wishlist", 60, async (c) => {
    await setWishlisted(c.id, p.data.productId, p.data.on);
    revalidatePath("/account/wishlist");
    return { ok: true as const, ids: await wishlistIds(c.id) };
  });
}

// ---------- Guest tracking (FR-AC-07) ----------

export type TrackResult =
  | { ok: true; order: CustomerOrder }
  | { ok: false; error: string; fields?: Partial<Record<"orderNo" | "phone", string>> };

export async function trackOrderAction(raw: unknown): Promise<TrackResult> {
  const p = trackInput.safeParse(raw);
  if (!p.success) {
    const fields: Partial<Record<"orderNo" | "phone", string>> = {};
    for (const i of p.error.issues) {
      const k = i.path[0] as "orderNo" | "phone";
      if (!fields[k]) fields[k] = i.message;
    }
    return { ok: false, error: "Please check the highlighted fields.", fields };
  }
  try {
    const { ip } = await requestMeta();
    // Per IP (10 minutes) and per order number (an hour): numbers and phones can't be tried in bulk.
    const [byIp, byOrder] = await Promise.all([
      rateLimit(redis(), `track:ip:${ip ?? "unknown"}`, TRACK_LIMITS.perIp, 600),
      rateLimit(redis(), `track:order:${p.data.orderNo}`, TRACK_LIMITS.perOrder, 3600),
    ]);
    if (!byIp.allowed || !byOrder.allowed) {
      return { ok: false, error: "Too many tries. Please wait a few minutes and try again." };
    }
    const order = await trackOrder(p.data);
    return order ? { ok: true, order } : { ok: false, error: TRACK_NOT_FOUND };
  } catch (err) {
    logger.error({ err }, "order tracking failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
