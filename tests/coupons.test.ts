import { describe, expect, it } from "vitest";
import { checkoutInput, checkoutTotals, fieldErrors } from "@/modules/checkout/checkout";
import {
  applyCoupon,
  couponInput,
  couponStatus,
  describeCoupon,
  normalizeCouponCode,
  withSubcategories,
  type Coupon,
  type CouponTerms,
} from "@/modules/coupons/coupons";
import { defaultRules, type Zone } from "@/modules/delivery/charge";

const oid = (n: number) => n.toString(16).padStart(24, "0");
const NOW = Date.parse("2026-11-21T06:00:00Z");
const KITCHEN = oid(500);
const DECOR = oid(501);

// ৳1,450 chopper ×2 in Kitchen + ৳600 lamp in Decoration = ৳3,500
const chopper = { productId: oid(1), categoryIds: [KITCHEN], price: 145000, qty: 2, weightGrams: 400 };
const lamp = { productId: oid(2), categoryIds: [DECOR], price: 60000, qty: 1, weightGrams: 300 };
const lines = [chopper, lamp];

const terms = (patch: Partial<CouponTerms> = {}): CouponTerms => ({
  code: "SAVE10",
  type: "percent",
  value: 10,
  minOrder: 0,
  maxDiscount: 0,
  startsAt: null,
  endsAt: null,
  productIds: [],
  categoryIds: [],
  ...patch,
});

describe("coupon codes", () => {
  it("are upper case without spaces", () => {
    expect(normalizeCouponCode(" eid 25 ")).toBe("EID25");
    expect(normalizeCouponCode("winter_sale-2026")).toBe("WINTER_SALE-2026");
    expect(normalizeCouponCode("ab")).toBeNull();
    expect(normalizeCouponCode("NO!")).toBeNull();
    expect(normalizeCouponCode({ $ne: "" })).toBeNull();
  });
});

describe("applying a coupon", () => {
  it("takes a percent off the whole cart, rounded to whole taka", () => {
    // 10% of ৳3,500 = ৳350
    expect(applyCoupon(terms(), lines, NOW)).toMatchObject({ ok: true, discount: 35000, freeDelivery: false });
    // 7% of ৳3,500 = ৳245
    expect(applyCoupon(terms({ value: 7 }), lines, NOW)).toMatchObject({ discount: 24500 });
    // 3% of ৳1,450.50 = ৳43.515 → ৳44
    const odd = [{ ...chopper, price: 145050, qty: 1 }];
    expect(applyCoupon(terms({ value: 3 }), odd, NOW)).toMatchObject({ discount: 4400 });
  });

  it("caps a percent coupon at its most", () => {
    expect(applyCoupon(terms({ value: 50, maxDiscount: 30000 }), lines, NOW)).toMatchObject({ discount: 30000 });
  });

  it("takes an amount off, never more than the products it covers", () => {
    expect(applyCoupon(terms({ type: "fixed", value: 20000 }), lines, NOW)).toMatchObject({ discount: 20000 });
    expect(applyCoupon(terms({ type: "fixed", value: 500000 }), lines, NOW)).toMatchObject({ discount: 350000 });
    const lampOnly = terms({ type: "fixed", value: 100000, categoryIds: [DECOR] });
    expect(applyCoupon(lampOnly, lines, NOW)).toMatchObject({ discount: 60000 });
  });

  it("only discounts the products and categories in scope", () => {
    // 10% of the chopper lines only (৳2,900)
    expect(applyCoupon(terms({ categoryIds: [KITCHEN] }), lines, NOW)).toMatchObject({
      discount: 29000,
      eligibleSubtotal: 290000,
    });
    expect(applyCoupon(terms({ productIds: [oid(2)] }), lines, NOW)).toMatchObject({ discount: 6000 });
    expect(applyCoupon(terms({ productIds: [oid(9)] }), lines, NOW)).toEqual({
      ok: false,
      error: "This code doesn't cover the products in your cart.",
    });
  });

  it("needs the minimum order, counted on the whole cart", () => {
    const r = applyCoupon(terms({ minOrder: 400000 }), lines, NOW);
    expect(r).toEqual({ ok: false, error: "This code needs an order of ৳4,000. Add ৳500 more." });
    expect(applyCoupon(terms({ minOrder: 350000 }), lines, NOW).ok).toBe(true);
  });

  it("works only between its dates", () => {
    expect(applyCoupon(terms({ startsAt: "2026-11-22T00:00:00.000Z" }), lines, NOW)).toMatchObject({
      ok: false,
      error: "This code isn't active yet.",
    });
    expect(applyCoupon(terms({ endsAt: "2026-11-21T06:00:00.000Z" }), lines, NOW)).toMatchObject({
      ok: false,
      error: "This code has expired.",
    });
  });

  it("can make delivery free", () => {
    expect(applyCoupon(terms({ type: "free_delivery", value: 0 }), lines, NOW)).toMatchObject({
      ok: true,
      discount: 0,
      freeDelivery: true,
    });
  });

  it("covers sub-categories of a chosen category", () => {
    const cats = [
      { id: "home", parentId: null },
      { id: "kitchen", parentId: "home" },
      { id: "choppers", parentId: "kitchen" },
      { id: "decor", parentId: null },
    ];
    expect(withSubcategories(["home"], cats).sort()).toEqual(["choppers", "home", "kitchen"]);
    expect(withSubcategories(["decor"], cats)).toEqual(["decor"]);
  });
});

describe("totals with a coupon", () => {
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
  const t = (patch: { discount?: number; freeDelivery?: boolean }) =>
    checkoutTotals({ zone, rules: defaultRules(), lines, paymentMethod: "cod", now: NOW, ...patch });

  it("takes the discount off before delivery", () => {
    const base = t({});
    expect(t({ discount: 35000 })).toMatchObject({ discount: 35000, total: base.total - 35000 });
  });

  it("free-delivery coupon: delivery is ৳0 and shows why", () => {
    const r = t({ freeDelivery: true });
    expect(r.delivery).toMatchObject({ charge: 0, reason: "coupon" });
    expect(r.total).toBe(350000);
  });
});

describe("coupon status and wording", () => {
  const c = (patch: Partial<Coupon> = {}): Coupon => ({
    id: oid(1),
    ...terms(),
    usageLimit: 0,
    perCustomerLimit: 1,
    usedCount: 0,
    active: true,
    note: "",
    ...patch,
  });

  it("knows when a coupon is live", () => {
    expect(couponStatus(c(), NOW)).toBe("active");
    expect(couponStatus(c({ active: false }), NOW)).toBe("off");
    expect(couponStatus(c({ startsAt: "2026-12-01T00:00:00.000Z" }), NOW)).toBe("scheduled");
    expect(couponStatus(c({ endsAt: "2026-11-01T00:00:00.000Z" }), NOW)).toBe("expired");
    expect(couponStatus(c({ usageLimit: 5, usedCount: 5 }), NOW)).toBe("used_up");
  });

  it("describes the discount", () => {
    expect(describeCoupon({ type: "percent", value: 20, maxDiscount: 30000 })).toBe("20% off (up to ৳300)");
    expect(describeCoupon({ type: "fixed", value: 15000, maxDiscount: 0 })).toBe("৳150 off");
    expect(describeCoupon({ type: "free_delivery", value: 0, maxDiscount: 0 })).toBe("Free delivery");
  });
});

describe("coupon form in admin", () => {
  const base = { code: "eid25", type: "percent", value: "25", minOrder: "1000", maxDiscount: "300" };

  it("saves taka as poisha and the code in upper case", () => {
    expect(couponInput.parse(base)).toMatchObject({
      code: "EID25",
      value: 25,
      minOrder: 100000,
      maxDiscount: 30000,
      perCustomerLimit: 1,
      active: true,
    });
    expect(couponInput.parse({ ...base, type: "fixed", value: "150.5" })).toMatchObject({
      value: 15050,
      maxDiscount: 0,
    });
    expect(couponInput.parse({ ...base, type: "free_delivery", value: "9" })).toMatchObject({ value: 0 });
  });

  it("refuses bad values", () => {
    expect(couponInput.safeParse({ ...base, value: "0" }).success).toBe(false);
    expect(couponInput.safeParse({ ...base, value: "101" }).success).toBe(false);
    expect(couponInput.safeParse({ ...base, value: "12.5" }).success).toBe(false);
    expect(couponInput.safeParse({ ...base, type: "fixed", value: "0" }).success).toBe(false);
    expect(couponInput.safeParse({ ...base, code: "a b!" }).success).toBe(false);
    expect(
      couponInput.safeParse({
        ...base,
        startsAt: "2026-12-10T00:00:00.000Z",
        endsAt: "2026-12-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(couponInput.safeParse({ ...base, productIds: [{ $ne: "" }] }).success).toBe(false);
  });
});

describe("coupon code at checkout", () => {
  const form = {
    name: "Rahim Uddin",
    phone: "01712345678",
    districtId: oid(10),
    areaId: oid(11),
    address: "House 12, Road 5, Dhanmondi",
    paymentMethod: "cod",
    acceptTerms: true,
  };

  it("is optional and saved in upper case", () => {
    expect(checkoutInput.parse(form).couponCode).toBe("");
    expect(checkoutInput.parse({ ...form, couponCode: " eid 25 " }).couponCode).toBe("EID25");
  });

  it("must look like a code", () => {
    const r = checkoutInput.safeParse({ ...form, couponCode: "!!" });
    expect(fieldErrors(r.error!).couponCode).toMatch(/Check the code/);
  });
});
