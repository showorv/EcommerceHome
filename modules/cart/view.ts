/**
 * The cart as the shopper sees it, and helpers the browser uses. No zod here: the cart store is on
 * every storefront page, and this keeps the validation library off shoppers' phones (NFR-PF-02).
 */

/** Current facts about a variant, read on the server. null = gone (deleted). */
export type VariantFacts = {
  productId: string;
  /** The product's categories (coupon scope). */
  categoryIds: string[];
  slug: string;
  title: string;
  variantTitle: string;
  image: { url: string; alt: string } | null;
  price: number;
  compareAt: number;
  weightGrams: number;
  available: number;
  /** Product active and variant switched on. */
  sellable: boolean;
};

export type CartLine = Omit<VariantFacts, "sellable"> & {
  variantId: string;
  qty: number;
  /** Most the shopper can have of this line now (0 when it can't be bought). */
  maxQty: number;
  /** Why the line can't be ordered as it is, or null. */
  problem: null | "unavailable" | "soldOut" | "tooMany";
};

export type CartView = {
  lines: CartLine[];
  /** Items in the badge: every unit in the cart. */
  count: number;
  /** Sum of the lines that can be ordered, at today's prices (poisha). */
  subtotal: number;
  /** Weight of the lines that can be ordered (packaging is added at checkout). */
  weightGrams: number;
  /** Store-wide free-delivery amount, when there is one. */
  freeAbove: number | null;
  /** Some line needs the shopper's attention before checkout. */
  hasProblems: boolean;
  signedIn: boolean;
};

export const EMPTY_CART: CartView = {
  lines: [],
  count: 0,
  subtotal: 0,
  weightGrams: 0,
  freeAbove: null,
  hasProblems: false,
  signedIn: false,
};

/** "Add ৳350 more for free delivery": what's missing, or null when there is no rule or it's reached. */
export function freeDeliveryGap(cart: Pick<CartView, "subtotal" | "freeAbove">): number | null {
  if (!cart.freeAbove || cart.subtotal <= 0) return null;
  return cart.subtotal >= cart.freeAbove ? 0 : cart.freeAbove - cart.subtotal;
}
