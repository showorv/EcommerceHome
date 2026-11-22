"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { setWishlistAction, wishlistStateAction } from "@/modules/account/actions";
import { cartState, subscribeCart } from "./cart/cart-store";

/**
 * The wishlist in the browser (FR-AC-06, FR-PC-01): which products the signed-in customer saved, shared
 * by every heart button. It asks the server only once the cart's answer says the visitor is signed in,
 * so guests cost no extra request. A guest's heart offers sign-in instead.
 */

type State = { ids: ReadonlySet<string>; signedIn: boolean; busy: ReadonlySet<string> };

const EMPTY: State = { ids: new Set(), signedIn: false, busy: new Set() };
let state: State = EMPTY;
const listeners = new Set<() => void>();
let started = false;
let loadedFor: boolean | null = null;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

async function load() {
  const res = await wishlistStateAction().catch(() => null);
  if (res) set({ ids: new Set(res.ids), signedIn: res.signedIn });
}

/** Follows the cart: signed in → load the wishlist; signed out → forget it. */
function follow() {
  const { cart, synced } = cartState();
  if (!synced || loadedFor === cart.signedIn) return;
  loadedFor = cart.signedIn;
  if (cart.signedIn) void load();
  else set({ ids: new Set(), signedIn: false });
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  subscribeCart(follow);
  follow();
}

function subscribe(l: () => void) {
  listeners.add(l);
  start();
  return () => void listeners.delete(l);
}

export function useWishlisted(productId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.ids.has(productId),
    () => false,
  );
}

/** The saved ids once known (null until the page knows the visitor is signed in). */
export function useWishlistIds(): ReadonlySet<string> | null {
  return useSyncExternalStore(
    subscribe,
    () => (state.signedIn ? state.ids : null),
    () => null,
  );
}

/** After signing out. */
export function forgetWishlist() {
  loadedFor = false;
  set({ ids: new Set(), signedIn: false });
}

/**
 * Saves or removes a product. Shows the change at once and puts it back if the server says no.
 * Answers "signIn" when the visitor has to sign in first (the button offers it).
 */
export async function toggleWishlist(productId: string, title: string): Promise<"signIn" | void> {
  // Clicked before the page knew who's here: ask now rather than offer sign-in to a signed-in customer.
  if (!state.signedIn && loadedFor !== false) await load();
  if (!state.signedIn) return "signIn";
  if (state.busy.has(productId)) return;
  const on = !state.ids.has(productId);
  const before = state.ids;
  const ids = new Set(before);
  if (on) ids.add(productId);
  else ids.delete(productId);
  set({ ids, busy: new Set([...state.busy, productId]) });
  try {
    const res = await setWishlistAction({ productId, on }).catch(
      () => ({ ok: false, error: "Couldn't reach the store. Check your connection." }) as const,
    );
    if (res.ok) {
      set({ ids: new Set(res.ids) });
      toast.success(on ? `${title} saved to your wishlist.` : `${title} removed from your wishlist.`);
    } else {
      set({ ids: before });
      if ("signIn" in res && res.signIn) {
        set({ signedIn: false });
        return "signIn";
      }
      toast.error(res.error);
    }
  } finally {
    const busy = new Set(state.busy);
    busy.delete(productId);
    set({ busy });
  }
}
