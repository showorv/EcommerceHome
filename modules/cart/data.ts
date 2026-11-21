import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { isProd } from "@/lib/env";
import { getSession } from "@/modules/auth/session";
import { videoPosterUrl } from "@/modules/catalog/media-url";
import { Product, Variant } from "@/modules/catalog/models";
import { getDeliveryConfig } from "@/modules/delivery/data";
import {
  addItem,
  buildCart,
  MAX_LINES,
  MAX_QTY,
  mergeItems,
  setItemQty,
  type CartItem,
  type CartView,
  type VariantFacts,
} from "./logic";
import { Cart } from "./models";

/**
 * Server side of the cart (FR-CO-01). A guest's cart is found by an httpOnly cookie; a signed-in
 * customer's by their user id. The first cart read or write after signing in moves the guest cart into
 * the account (same products add up) and forgets the guest cookie.
 */

export class CartError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

export const CART_COOKIE = "cart";
const GUEST_DAYS = 30;
const USER_DAYS = 180;
const DAY = 24 * 60 * 60 * 1000;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const expiry = (signedIn: boolean) => new Date(Date.now() + (signedIn ? USER_DAYS : GUEST_DAYS) * DAY);
const itemsOf = (doc: AnyDoc | null): CartItem[] =>
  ((doc?.items ?? []) as AnyDoc[]).map((i) => ({ variantId: String(i.variantId), qty: Number(i.qty) }));

type Who = { userId: string | null; tokenHash: string | null };

async function who(): Promise<Who> {
  const [session, jar] = await Promise.all([getSession(), cookies()]);
  const token = jar.get(CART_COOKIE)?.value;
  return {
    userId: session?.user.id ?? null,
    tokenHash: token && /^[A-Za-z0-9_-]{32,64}$/.test(token) ? hash(token) : null,
  };
}

async function setGuestCookie(): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  (await cookies()).set(CART_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    maxAge: GUEST_DAYS * 24 * 60 * 60,
  });
  return hash(token);
}

async function forgetGuestCookie() {
  (await cookies()).delete(CART_COOKIE);
}

/** Reads, changes and saves a cart's items; retries if another tab saved in between. */
async function writeItems(cartId: unknown, signedIn: boolean, change: (items: CartItem[]) => CartItem[]) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const doc = await Cart.findById(cartId).lean<AnyDoc>();
    if (!doc) throw new CartError("Your cart expired. Please add the products again.");
    const items = change(itemsOf(doc)).slice(0, MAX_LINES);
    const res = await Cart.updateOne(
      { _id: doc._id, rev: doc.rev ?? 0 },
      { $set: { items, expiresAt: expiry(signedIn) }, $inc: { rev: 1 } },
    );
    if (res.modifiedCount === 1) return items;
  }
  throw new CartError("Your cart is being changed in another tab. Please try again.");
}

async function userCart(userId: string): Promise<AnyDoc> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const doc = await Cart.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId, items: [], rev: 0, expiresAt: expiry(true) } },
        { upsert: true, new: true },
      ).lean<AnyDoc>();
      if (doc) return doc;
    } catch (err) {
      // Two requests creating the same account cart at once: the second one reads it.
      if (!(err && typeof err === "object" && "code" in err && err.code === 11000)) throw err;
    }
  }
  throw new CartError("Please try again.");
}

/**
 * The cart to use for this request. Signed in: the account cart, with any guest cart merged in.
 * Guest: the cookie's cart, or (with `create`) a new one.
 */
async function currentCart(w: Who, create: boolean): Promise<{ id: unknown; items: CartItem[] } | null> {
  const guest = w.tokenHash ? await Cart.findOne({ guestTokenHash: w.tokenHash }).lean<AnyDoc>() : null;
  if (w.userId) {
    if (w.tokenHash && !guest) await forgetGuestCookie(); // stale cookie
    // Only a write (or a guest cart to keep) creates the account cart; looking at the store doesn't.
    const mine = create || guest ? await userCart(w.userId) : await Cart.findOne({ userId: w.userId }).lean<AnyDoc>();
    if (!mine) return null;
    if (guest) {
      const items = await writeItems(mine._id, true, (cur) => mergeItems(cur, itemsOf(guest)));
      await Cart.deleteOne({ _id: guest._id });
      await forgetGuestCookie();
      return { id: mine._id, items };
    }
    return { id: mine._id, items: itemsOf(mine) };
  }
  if (guest) return { id: guest._id, items: itemsOf(guest) };
  if (!create) return null;
  const guestTokenHash = await setGuestCookie();
  const doc = await Cart.create({ guestTokenHash, items: [], expiresAt: expiry(false) });
  return { id: doc._id, items: [] };
}

// ---------- Current product facts ----------

function imageFor(product: AnyDoc, mediaIds: string[]): { url: string; alt: string } | null {
  const media = ((product.media ?? []) as AnyDoc[]).filter((m) => m.type === "image" || m.type === "video");
  const pick = media.find((m) => mediaIds.includes(String(m._id))) ?? media[0];
  if (!pick) return null;
  const url = pick.type === "video" ? String(pick.poster || videoPosterUrl(String(pick.url))) : String(pick.url);
  return url ? { url, alt: String(pick.alt ?? "") } : null;
}

export async function variantFacts(variantIds: string[]): Promise<Map<string, VariantFacts>> {
  const facts = new Map<string, VariantFacts>();
  if (variantIds.length === 0) return facts;
  const variants = await Variant.find(trustFilter({ _id: { $in: variantIds } }))
    .select("productId title price compareAtPrice weightGrams stock reserved mediaIds active")
    .lean<AnyDoc[]>();
  const productIds = [...new Set(variants.map((v) => String(v.productId)))];
  const products = await Product.find(trustFilter({ _id: { $in: productIds } }), null, { withDeleted: true })
    .select("title slug status media categoryIds deletedAt")
    .lean<AnyDoc[]>();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  for (const v of variants) {
    const p = byId.get(String(v.productId));
    if (!p) continue;
    facts.set(String(v._id), {
      productId: String(p._id),
      categoryIds: ((p.categoryIds ?? []) as unknown[]).map(String),
      slug: String(p.slug),
      title: String(p.title?.en ?? ""),
      variantTitle: String(v.title ?? ""),
      image: imageFor(p, ((v.mediaIds ?? []) as string[]).map(String)),
      price: Number(v.price ?? 0),
      compareAt: Number(v.compareAtPrice ?? 0),
      weightGrams: Number(v.weightGrams ?? 0),
      available: Math.max(0, Number(v.stock ?? 0) - Number(v.reserved ?? 0)),
      sellable: p.status === "active" && !p.deletedAt && v.active !== false,
    });
  }
  return facts;
}

async function view(items: CartItem[], signedIn: boolean): Promise<CartView> {
  const [facts, delivery] = await Promise.all([variantFacts(items.map((i) => i.variantId)), getDeliveryConfig()]);
  const freeAbove = delivery.rules.freeAbove > 0 ? delivery.rules.freeAbove : null;
  return buildCart(items, facts, { freeAbove, signedIn });
}

// ---------- Public operations ----------

/**
 * The cart for this browser. `local` is the browser's copy of a guest cart: used only when the server
 * has no cart for it (cookie lost or expired) or to add a guest cart to the account after signing in.
 */
export async function loadCart(local: CartItem[]): Promise<CartView> {
  await connectMongoose();
  const w = await who();
  const signedIn = w.userId !== null;
  let cart = await currentCart(w, false);
  if (local.length > 0 && (!cart || (signedIn && !w.tokenHash))) {
    const facts = await variantFacts(local.map((i) => i.variantId));
    const restorable = local.filter((i) => facts.get(i.variantId)?.sellable);
    if (restorable.length > 0) {
      const target = cart ?? (await currentCart(w, true));
      if (target) {
        const items = await writeItems(target.id, signedIn, (cur) => mergeItems(cur, restorable));
        cart = { id: target.id, items };
      }
    }
  }
  return view(cart?.items ?? [], signedIn);
}

export type CartChange = { cart: CartView; message?: string };

/** Adds a variant, or the only variant of a product. Never more than is in stock (or MAX_QTY). */
export async function addToCart(
  target: { variantId: string } | { productId: string },
  qty: number,
): Promise<CartChange> {
  await connectMongoose();
  let variantId: string;
  if ("variantId" in target) {
    variantId = target.variantId;
  } else {
    const vs = await Variant.find({ productId: target.productId, active: true })
      .select("_id")
      .limit(2)
      .lean<AnyDoc[]>();
    if (vs.length !== 1) throw new CartError("Please choose the options first.");
    variantId = String(vs[0]!._id);
  }
  const f = (await variantFacts([variantId])).get(variantId);
  if (!f || !f.sellable) throw new CartError("Sorry, this product isn't available any more.");
  if (f.available <= 0) throw new CartError("Sorry, this is sold out.");

  const w = await who();
  const signedIn = w.userId !== null;
  const cart = await currentCart(w, true);
  if (!cart) throw new CartError("Please try again.");
  const limit = Math.min(MAX_QTY, f.available);
  let added = 0;
  const items = await writeItems(cart.id, signedIn, (cur) => {
    const have = cur.find((i) => i.variantId === variantId)?.qty ?? 0;
    added = Math.max(0, Math.min(qty, limit - have));
    if (added === 0) return cur;
    if (have === 0 && cur.length >= MAX_LINES)
      throw new CartError("Your cart is full. Please order what's in it first.");
    return addItem(cur, variantId, added);
  });
  const name = f.variantTitle ? `${f.title} (${f.variantTitle})` : f.title;
  const message =
    added === qty
      ? `${name} added to your cart.`
      : added > 0
        ? `Only ${added} more could be added: you have the most we can sell of ${name}.`
        : `You already have the most we can sell of ${name} in your cart.`;
  return { cart: await view(items, signedIn), message };
}

/** Sets a line's quantity (0 removes it), never above what's in stock. */
export async function setCartQty(variantId: string, qty: number): Promise<CartChange> {
  await connectMongoose();
  const w = await who();
  const signedIn = w.userId !== null;
  const cart = await currentCart(w, false);
  if (!cart) return { cart: await view([], signedIn) };
  let message: string | undefined;
  let next = qty;
  if (qty > 0) {
    const f = (await variantFacts([variantId])).get(variantId);
    const limit = f?.sellable ? Math.min(MAX_QTY, f.available) : 0;
    if (next > limit && limit > 0) {
      next = limit;
      message = `Only ${limit} available.`;
    }
  }
  const items = await writeItems(cart.id, signedIn, (cur) => setItemQty(cur, variantId, next));
  return { cart: await view(items, signedIn), message };
}

/** Who the cart belongs to, for rate limiting writes. */
export async function cartOwnerKey(ip: string | null): Promise<string> {
  const w = await who();
  return w.userId ? `user:${w.userId}` : w.tokenHash ? `guest:${w.tokenHash.slice(0, 16)}` : `ip:${ip ?? "unknown"}`;
}
