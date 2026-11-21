import { describe, expect, it } from "vitest";
import type { CartLine } from "@/modules/cart/logic";
import { checkoutInput, checkoutTotals } from "@/modules/checkout/checkout";
import { defaultRules, type Zone } from "@/modules/delivery/charge";
import {
  buildOrder,
  formatOrderNo,
  isOrderNo,
  normalizeOrderKey,
  orderReceivedSms,
  showsLowStock,
} from "@/modules/orders/orders";
import { readReceipt, signReceipt } from "@/modules/orders/receipt";

const oid = (n: number) => n.toString(16).padStart(24, "0");
const NOW = new Date("2026-11-21T06:00:00Z");

const line = (patch: Partial<CartLine> = {}): CartLine => ({
  variantId: oid(11),
  productId: oid(1),
  categoryIds: [],
  slug: "mini-chopper",
  title: "Mini Chopper",
  variantTitle: "Red",
  image: { url: "/uploads/c.png", alt: "" },
  price: 145000,
  compareAt: 0,
  weightGrams: 400,
  available: 10,
  qty: 2,
  maxQty: 10,
  problem: null,
  ...patch,
});

const zone: Zone = {
  id: oid(900),
  name: "Inside Dhaka",
  baseCharge: 7000,
  baseWeightGrams: 1000,
  extraPerKg: 1500,
  codFeePercent: 0,
  freeAbove: 0,
  advanceRule: "none",
  courier: "none",
  minDays: 1,
  maxDays: 2,
  active: true,
};

const form = {
  name: "Rahim Uddin",
  phone: "01712345678",
  email: "",
  districtId: oid(10),
  areaId: oid(11),
  address: "House 12, Road 5, Dhanmondi",
  paymentMethod: "cod",
  acceptTerms: true,
};

function order(patch: Record<string, unknown> = {}, discount = 0) {
  const checkout = checkoutInput.parse({ ...form, ...patch });
  const lines = [line()];
  const totals = checkoutTotals({
    zone,
    rules: defaultRules(),
    lines,
    discount,
    paymentMethod: checkout.paymentMethod,
    now: NOW.getTime(),
  });
  return buildOrder({
    orderNo: formatOrderNo(10001),
    idempotencyKey: "k".repeat(64),
    checkout,
    lines,
    totals,
    zone,
    district: "Dhaka",
    area: "Dhanmondi",
    snapshot: new Map([[oid(11), { sku: "CHOP-RED", cost: 90000 }]]),
    userId: null,
    ip: "::1",
    userAgent: "test",
    now: NOW,
    reservationHours: 24,
  });
}

describe("order numbers and keys", () => {
  it("look like SR10001", () => {
    expect(formatOrderNo(10001)).toBe("SR10001");
    expect(isOrderNo("SR10234")).toBe(true);
    expect(isOrderNo("sr10234")).toBe(false);
    expect(isOrderNo({ $ne: "" })).toBe(false);
  });

  it("take only a UUID as the order key", () => {
    expect(normalizeOrderKey("6F1D2B3C-1111-4222-8333-944455556666")).toBe("6f1d2b3c-1111-4222-8333-944455556666");
    expect(normalizeOrderKey("not-a-key")).toBeNull();
    expect(normalizeOrderKey({ $gt: "" })).toBeNull();
  });
});

describe("the order a checkout becomes", () => {
  it("keeps a snapshot of each item, with SKU and cost", () => {
    const o = order();
    expect(o.items).toEqual([
      {
        productId: oid(1),
        variantId: oid(11),
        title: "Mini Chopper",
        variantTitle: "Red",
        sku: "CHOP-RED",
        slug: "mini-chopper",
        image: "/uploads/c.png",
        price: 145000,
        cost: 90000,
        qty: 2,
        weightGrams: 400,
      },
    ]);
  });

  it("starts pending, unpaid, with the stock held for the set hours", () => {
    const o = order();
    expect(o).toMatchObject({ status: "pending", paymentStatus: "unpaid", advance: null, source: "web" });
    expect(o.statusHistory).toEqual([{ status: "pending", at: NOW, by: null, note: "Placed on the website" }]);
    expect(o.reservation).toEqual({ active: true, until: new Date("2026-11-22T06:00:00Z"), releasedAt: null });
  });

  it("carries the server's amounts", () => {
    const o = order({}, 10000);
    // ৳2,900 − ৳100 coupon + ৳70 delivery
    expect(o).toMatchObject({ subtotal: 290000, discount: 10000, deliveryCharge: 7000, total: 287000 });
    expect(o.codAmount).toBe(287000);
    expect(o.shippingAddress).toMatchObject({ district: "Dhaka", area: "Dhanmondi", line: form.address });
  });

  it("records an advance to be checked", () => {
    const o = order({
      paymentMethod: "cod_advance",
      payWallet: "bkash",
      senderNumber: "01811111111",
      trxId: "9ab3kx72lm",
    });
    expect(o.paymentStatus).toBe("advance_pending");
    expect(o.advance).toEqual({
      method: "bkash",
      senderNumber: "+8801811111111",
      trxId: "9AB3KX72LM",
      amount: 7000,
      status: "pending",
    });
    expect(o.codAmount).toBe(290000);
  });

  it("refuses a line with no snapshot", () => {
    const checkout = checkoutInput.parse(form);
    const lines = [line()];
    const totals = checkoutTotals({ zone, rules: defaultRules(), lines, paymentMethod: "cod", now: NOW.getTime() });
    expect(() =>
      buildOrder({
        orderNo: "SR1",
        idempotencyKey: "k",
        checkout,
        lines,
        totals,
        zone,
        district: "",
        area: "",
        snapshot: new Map(),
        userId: null,
        ip: null,
        userAgent: null,
        now: NOW,
        reservationHours: 24,
      }),
    ).toThrow(/snapshot/);
  });
});

describe("after the order", () => {
  it("texts a short order-received message", () => {
    expect(orderReceivedSms("SR10234", "China Import Store")).toBe(
      "China Import Store: Order #SR10234 received. We will call you to confirm.",
    );
  });

  it("rebuilds the product page only when it shows low stock", () => {
    expect(showsLowStock({ stock: 20, reserved: 2 }, 5)).toBe(false);
    expect(showsLowStock({ stock: 7, reserved: 2 }, 5)).toBe(true);
    expect(showsLowStock({ stock: 1, reserved: 3 }, 5)).toBe(true);
  });
});

describe("thank-you page pass", () => {
  const secret = "s".repeat(32);
  const id = oid(77);

  it("reads back the order id until it expires", () => {
    const t = signReceipt(secret, id, 2000);
    expect(readReceipt(secret, t, 1000)).toBe(id);
    expect(readReceipt(secret, t, 2000)).toBeNull();
  });

  it("refuses a changed or foreign pass", () => {
    const t = signReceipt(secret, id, 2000);
    const [body, sig] = t.split(".");
    const other = Buffer.from(JSON.stringify({ o: oid(78), e: 2000 })).toString("base64url");
    expect(readReceipt(secret, `${other}.${sig}`, 1000)).toBeNull();
    expect(readReceipt("x".repeat(32), t, 1000)).toBeNull();
    expect(readReceipt(secret, `${body}`, 1000)).toBeNull();
    expect(readReceipt(secret, undefined, 1000)).toBeNull();
  });
});
