"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { track } from "@/components/store/analytics/pixels";
import { reorderAction } from "@/modules/account/actions";
import { addToCartAction, loadCartAction, setCartQtyAction, type CartResult } from "@/modules/cart/actions";
import { EMPTY_CART, type CartView } from "@/modules/cart/view";

/**
 * The cart in the browser (FR-CO-01): one small store shared by the header badge, the drawer, the cart
 * page and every "Add to cart" button. The server is the source of truth; a copy in localStorage shows
 * the badge instantly on the next visit and brings a guest cart back if its cookie was lost.
 */

type State = {
  cart: CartView;
  /** The server has answered at least once on this page. */
  synced: boolean;
  open: boolean;
  /** Variant ids (or "add") with a request in flight. */
  busy: string[];
};

const STORAGE_KEY = "cart:v1";
let state: State = { cart: EMPTY_CART, synced: false, open: false, busy: [] };
const listeners = new Set<() => void>();
const SERVER_STATE = state;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  start();
  return () => void listeners.delete(l);
}

/** For other browser stores that follow the cart's answer (the wishlist loads once it says "signed in"). */
export function subscribeCart(l: () => void): () => void {
  return subscribe(l);
}
export const cartState = (): State => state;

export function useCart(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
}

/** Just "is something being added right now", so product cards don't re-render on every cart change. */
export function useCartAdding(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.busy.includes("add"),
    () => false,
  );
}

// ---------- The browser's copy ----------

function readLocal(): CartView | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as CartView;
    return Array.isArray(v?.lines) ? { ...EMPTY_CART, ...v } : null;
  } catch {
    return null;
  }
}

function saveLocal(cart: CartView) {
  try {
    if (cart.lines.length === 0 && !cart.signedIn) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // Private mode or storage full: the server copy still works.
  }
}

function apply(cart: CartView) {
  set({ cart, synced: true });
  saveLocal(cart);
}

// ---------- Loading ----------

let started = false;

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const local = readLocal();
  if (local) set({ cart: local });
  void reloadCart();
  // Another tab changed the cart.
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    const next = readLocal();
    set({ cart: next ?? EMPTY_CART });
  });
}

/**
 * Asks the server for the cart. Call after signing in: the guest cart joins the account cart.
 * A copy that belonged to a signed-in customer is never offered back as a guest cart.
 */
export async function reloadCart() {
  const local = readLocal();
  const offer = local && !local.signedIn ? local.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })) : [];
  const res = await loadCartAction(offer).catch(() => null);
  if (res?.ok) apply(res.cart);
}

/** After signing out: the account's cart stays with the account, this browser starts empty. */
export function forgetCart() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  set({ cart: EMPTY_CART, open: false });
}

// ---------- Changes ----------

export function setCartOpen(open: boolean) {
  set({ open });
}

async function run(key: string, call: () => Promise<CartResult>): Promise<CartResult> {
  set({ busy: [...state.busy, key] });
  try {
    const res = await call().catch(
      () => ({ ok: false, error: "Couldn't reach the store. Check your connection." }) as CartResult,
    );
    if (res.ok) apply(res.cart);
    else toast.error(res.error);
    return res;
  } finally {
    set({ busy: state.busy.filter((b) => b !== key) });
  }
}

/** Adds to the cart; opens the drawer unless `silent` (e.g. "Order now" goes straight on). */
export async function addToCart(
  target: { variantId: string } | { productId: string },
  qty = 1,
  opts: { silent?: boolean } = {},
): Promise<boolean> {
  const res = await run("add", () => addToCartAction({ ...target, qty }));
  if (!res.ok) return false;
  const line = res.cart.lines.find((l) =>
    "variantId" in target ? l.variantId === target.variantId : l.productId === target.productId,
  );
  if (line) {
    track({
      name: "add_to_cart",
      value: line.price * qty,
      items: [{ id: line.productId, name: line.title, price: line.price, qty }],
    });
  }
  if (!opts.silent) {
    set({ open: true });
    if (res.message && !res.message.endsWith("added to your cart.")) toast.info(res.message);
  }
  return true;
}

/** Sets a line's quantity (0 removes it). Shows the change at once, then the server's answer. */
export async function setLineQty(variantId: string, qty: number) {
  const before = state.cart;
  const lines =
    qty <= 0
      ? before.lines.filter((l) => l.variantId !== variantId)
      : before.lines.map((l) => (l.variantId === variantId ? { ...l, qty } : l));
  set({ cart: { ...before, lines, count: lines.reduce((n, l) => n + l.qty, 0) } });
  const res = await run(variantId, () => setCartQtyAction({ variantId, qty }));
  if (!res.ok) set({ cart: before });
  else if (res.message) toast.info(res.message);
}

/**
 * "Order again" (FR-AC-06): puts a past order's products back in the cart, as many as are in stock, and
 * says which ones can't be ordered any more.
 */
export async function reorder(orderNo: string): Promise<boolean> {
  set({ busy: [...state.busy, "add"] });
  try {
    const res = await reorderAction({ orderNo }).catch(
      () => ({ ok: false, error: "Couldn't reach the store. Check your connection." }) as const,
    );
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    apply(res.cart);
    if (res.added > 0) {
      set({ open: true });
      if (res.skipped.length > 0) toast.info(`Not added: ${res.skipped.join(", ")}.`);
      return true;
    }
    if (res.skipped.length > 0) toast.error(`These can't be ordered now: ${res.skipped.join(", ")}.`);
    else toast.info("You already have the most we can sell of these in your cart.");
    return false;
  } finally {
    set({ busy: state.busy.filter((b) => b !== "add") });
  }
}
