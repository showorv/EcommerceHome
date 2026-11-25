import { describe, expect, it } from "vitest";
import { requiredPermission } from "@/modules/auth/admin-routes";
import { can } from "@/modules/auth/rbac";
import {
  buildManualOrder,
  manualFieldErrors,
  manualOrderInput,
  manualPaymentMethod,
  manualTotals,
} from "@/modules/orders/manual";
import { readSource } from "@/modules/orders/orders";

const V1 = "a".repeat(24);
const V2 = "b".repeat(24);
const base = {
  key: "3b241101-e2bb-4255-8caf-4136c566a962",
  source: "facebook",
  name: "Rahim Uddin",
  phone: "01712-345678",
  districtId: "c".repeat(24),
  areaId: "d".repeat(24),
  address: "House 12, Road 5, Mirpur 10",
  items: [{ variantId: V1, qty: 2 }],
};

describe("manual order form", () => {
  it("accepts a cash-on-delivery order and cleans it up", () => {
    const p = manualOrderInput.parse({ ...base, discount: "50", deliveryCharge: "" });
    expect(p.phone).toBe("+8801712345678");
    expect(p.discount).toBe(5000);
    expect(p.deliveryCharge).toBeNull();
    expect(p).toMatchObject({ payWallet: "", senderNumber: "", trxId: "", advanceAmount: 0, email: "", note: "" });
  });

  it("names the field with the problem", () => {
    const r = manualOrderInput.safeParse({ ...base, source: "web", phone: "123", items: [] });
    expect(r.success).toBe(false);
    const e = manualFieldErrors(r.error!);
    expect(e.source).toMatch(/where the order came from/);
    expect(e.phone).toMatch(/Bangladeshi/);
    expect(e.items).toMatch(/at least one/);
  });

  it("refuses the same product twice, odd amounts and too many", () => {
    const twice = manualOrderInput.safeParse({ ...base, items: [base.items[0], base.items[0]] });
    expect(manualFieldErrors(twice.error!).items).toMatch(/twice/);
    const money = manualOrderInput.safeParse({ ...base, discount: "12,5" });
    expect(manualFieldErrors(money.error!).discount).toMatch(/taka/);
    const many = manualOrderInput.safeParse({ ...base, items: [{ variantId: V1, qty: 100 }] });
    expect(many.success).toBe(false);
    const bad = manualOrderInput.safeParse({ ...base, items: [{ variantId: { $ne: 1 }, qty: 1 }] });
    expect(bad.success).toBe(false);
  });

  it("needs the sender, TrxID and amount for an advance", () => {
    const r = manualOrderInput.safeParse({ ...base, payWallet: "bkash" });
    const e = manualFieldErrors(r.error!);
    expect(Object.keys(e).sort()).toEqual(["advanceAmount", "senderNumber", "trxId"]);
    const ok = manualOrderInput.parse({
      ...base,
      payWallet: "bkash",
      senderNumber: "01812345678",
      trxId: "abc123def4",
      advanceAmount: "120",
    });
    expect(ok).toMatchObject({ senderNumber: "+8801812345678", trxId: "ABC123DEF4", advanceAmount: 12000 });
  });

  it("drops advance fields when no wallet is chosen", () => {
    const p = manualOrderInput.parse({ ...base, senderNumber: "017", trxId: "x", advanceAmount: "500" });
    expect(p).toMatchObject({ senderNumber: "", trxId: "", advanceAmount: 0 });
  });
});

describe("manual order totals", () => {
  const items = [
    { price: 145_000, qty: 2 },
    { price: 20_000, qty: 1 },
  ];

  it("works like an edited order", () => {
    const t = manualTotals({ items, discount: 10_000, deliveryCharge: 6_000, codFeePercent: 1, advancePaid: 0 });
    expect(t).toMatchObject({
      subtotal: 310_000,
      discount: 10_000,
      deliveryCharge: 6_000,
      codFee: 3_100,
      total: 309_100,
    });
    expect(t.codAmount).toBe(309_100); // 1% COD fee, rounded to whole taka
  });

  it("takes the advance off the door amount", () => {
    const t = manualTotals({ items, discount: 0, deliveryCharge: 6_000, codFeePercent: 0, advancePaid: 6_000 });
    expect(t.codAmount).toBe(310_000);
    expect(manualPaymentMethod(t.advancePaid, t.total)).toBe("cod_advance");
    expect(manualPaymentMethod(0, t.total)).toBe("cod");
    expect(manualPaymentMethod(t.total, t.total)).toBe("full");
  });
});

describe("the saved order", () => {
  it("records where it came from and who took it", () => {
    const form = manualOrderInput.parse({
      ...base,
      items: [
        { variantId: V1, qty: 1 },
        { variantId: V2, qty: 1 },
      ],
      payWallet: "nagad",
      senderNumber: "01812345678",
      trxId: "ABC123DEF4",
      advanceAmount: "60",
    });
    const item = (variantId: string) => ({
      productId: "e".repeat(24),
      variantId,
      title: "Chopper",
      variantTitle: "",
      sku: "X",
      slug: "x",
      image: null,
      price: 100_000,
      cost: 60_000,
      qty: 1,
      weightGrams: 500,
    });
    const items = [item(V1), item(V2)];
    const totals = manualTotals({ items, discount: 0, deliveryCharge: 8_000, codFeePercent: 0, advancePaid: 6_000 });
    const now = new Date("2026-11-22T10:00:00Z");
    const o = buildManualOrder({
      orderNo: "SR10050",
      idempotencyKey: "k",
      form,
      items,
      totals,
      zone: { id: "z", name: "Dhaka city" },
      district: "Dhaka",
      area: "Mirpur",
      quote: { charge: 6_000, reason: "weight", weightGrams: 1100, minDays: 1, maxDays: 2 },
      risk: { score: 10, level: "low", reasons: [] },
      by: { id: "u1", name: "Karim" },
      now,
      reservationHours: 24,
    });
    expect(o.source).toBe("facebook");
    expect(o.userId).toBeNull();
    expect(o.status).toBe("pending");
    expect(o.statusHistory[0]).toMatchObject({ by: "u1", byName: "Karim", note: "Taken by Karim from Facebook" });
    expect(o.delivery).toMatchObject({ reason: "staff", regularCharge: 6_000 });
    expect(o.advance).toMatchObject({ method: "nagad", amount: 6_000, status: "pending" });
    expect(o.paymentStatus).toBe("advance_pending");
    expect(o.paymentMethod).toBe("cod_advance");
    expect(o.total).toBe(208_000);
    expect(o.codAmount).toBe(202_000);
    expect(o.reservation.until.toISOString()).toBe("2026-11-23T10:00:00.000Z");
  });

  it("reads unknown sources as the website", () => {
    expect(readSource("whatsapp")).toBe("whatsapp");
    expect(readSource(undefined)).toBe("web");
    expect(readSource("evil")).toBe("web");
  });
});

describe("access", () => {
  it("staff and up can take manual orders", () => {
    expect(requiredPermission("/admin/orders/new")).toBe("orders.create");
    expect(requiredPermission("/admin/orders/SR10001")).toBe("orders.view");
    expect(can({ role: "staff" }, "orders.create")).toBe(true);
    expect(can({ role: "manager" }, "orders.create")).toBe(true);
    expect(can({ role: "customer" }, "orders.create")).toBe(false);
  });
});
