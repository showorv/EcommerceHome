import { describe, expect, it } from "vitest";
import {
  addItem,
  buildCart,
  cleanItems,
  freeDeliveryGap,
  MAX_LINES,
  MAX_QTY,
  mergeItems,
  setItemQty,
  type VariantFacts,
} from "@/modules/cart/logic";

const id = (n: number) => n.toString(16).padStart(24, "0");

describe("cart items", () => {
  it("adds to an existing line and never above the maximum", () => {
    let items = addItem([], id(1), 2);
    items = addItem(items, id(1), 3);
    expect(items).toEqual([{ variantId: id(1), qty: 5 }]);
    items = addItem(items, id(1), 99);
    expect(items[0]!.qty).toBe(MAX_QTY);
    items = addItem(items, id(2), 1);
    expect(items.map((i) => i.variantId)).toEqual([id(1), id(2)]);
  });

  it("sets a quantity, and 0 removes the line", () => {
    const items = [
      { variantId: id(1), qty: 2 },
      { variantId: id(2), qty: 1 },
    ];
    expect(setItemQty(items, id(1), 4)[0]!.qty).toBe(4);
    expect(setItemQty(items, id(1), 0)).toEqual([{ variantId: id(2), qty: 1 }]);
    expect(setItemQty(items, id(9), 3)).toEqual(items);
  });

  it("merges a guest cart into an account cart: same products add up, to the maximum", () => {
    const account = [
      { variantId: id(1), qty: 8 },
      { variantId: id(2), qty: 1 },
    ];
    const guest = [
      { variantId: id(1), qty: 5 },
      { variantId: id(3), qty: 2 },
    ];
    expect(mergeItems(account, guest)).toEqual([
      { variantId: id(1), qty: MAX_QTY },
      { variantId: id(2), qty: 1 },
      { variantId: id(3), qty: 2 },
    ]);
  });

  it("never merges past the line limit", () => {
    const full = Array.from({ length: MAX_LINES }, (_, i) => ({ variantId: id(i + 1), qty: 1 }));
    const merged = mergeItems(full, [
      { variantId: id(999), qty: 1 },
      { variantId: id(1), qty: 1 },
    ]);
    expect(merged).toHaveLength(MAX_LINES);
    expect(merged[0]!.qty).toBe(2);
  });

  it("cleans the browser's copy: drops bad ids and quantities, joins duplicates", () => {
    expect(
      cleanItems([
        { variantId: id(1).toUpperCase(), qty: 2 },
        { variantId: id(1), qty: 3 },
        { variantId: "nope", qty: 1 },
        { variantId: id(2), qty: 0 },
        { variantId: id(3), qty: 1.5 },
        { variantId: { $ne: "" }, qty: 1 },
        null,
        { variantId: id(4), qty: 500 },
      ]),
    ).toEqual([
      { variantId: id(1), qty: 5 },
      { variantId: id(4), qty: MAX_QTY },
    ]);
    expect(cleanItems("x")).toEqual([]);
    expect(cleanItems({ variantId: id(1), qty: 1 })).toEqual([]);
  });
});

const facts = (patch: Partial<VariantFacts> = {}): VariantFacts => ({
  productId: id(100),
  slug: "mini-fan",
  title: "Mini fan",
  variantTitle: "",
  image: null,
  price: 50000,
  compareAt: 0,
  weightGrams: 400,
  available: 20,
  sellable: true,
  ...patch,
});

describe("what the shopper sees", () => {
  it("adds up today's prices and weights, and counts every unit", () => {
    const cart = buildCart(
      [
        { variantId: id(1), qty: 2 },
        { variantId: id(2), qty: 1 },
      ],
      new Map([
        [id(1), facts()],
        [id(2), facts({ price: 120000, weightGrams: 1500 })],
      ]),
      { freeAbove: null, signedIn: false },
    );
    expect(cart).toMatchObject({ count: 3, subtotal: 220000, weightGrams: 2300, hasProblems: false });
    expect(cart.lines[0]).toMatchObject({ maxQty: 10, problem: null });
  });

  it("flags lines that can't be ordered and leaves them out of the total", () => {
    const cart = buildCart(
      [
        { variantId: id(1), qty: 1 },
        { variantId: id(2), qty: 1 },
        { variantId: id(3), qty: 4 },
        { variantId: id(4), qty: 1 },
        { variantId: id(5), qty: 1 },
      ],
      new Map([
        [id(1), facts()],
        [id(2), facts({ sellable: false })],
        [id(3), facts({ available: 3 })],
        [id(4), facts({ available: 0 })],
        // id(5): deleted
      ]),
      { freeAbove: null, signedIn: true },
    );
    expect(cart.lines.map((l) => l.problem)).toEqual([null, "unavailable", "tooMany", "soldOut"]);
    expect(cart.lines[2]!.maxQty).toBe(3);
    expect(cart.subtotal).toBe(50000);
    expect(cart.count).toBe(7);
    expect(cart.hasProblems).toBe(true);
  });

  it("shows how much is missing for free delivery", () => {
    expect(freeDeliveryGap({ subtotal: 150000, freeAbove: 300000 })).toBe(150000);
    expect(freeDeliveryGap({ subtotal: 300000, freeAbove: 300000 })).toBe(0);
    expect(freeDeliveryGap({ subtotal: 150000, freeAbove: null })).toBeNull();
    expect(freeDeliveryGap({ subtotal: 0, freeAbove: 300000 })).toBeNull();
  });
});
