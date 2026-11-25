import { describe, expect, it } from "vitest";
import {
  allowedMethods,
  checkoutInput,
  checkoutTotals,
  fieldErrors,
  zoneForArea,
  type PaymentMethod,
} from "@/modules/checkout/checkout";
import { defaultRules, type Zone } from "@/modules/delivery/charge";

const oid = (n: number) => n.toString(16).padStart(24, "0");
const NOW = Date.parse("2026-11-21T06:00:00Z");

const zone = (patch: Partial<Zone> = {}): Zone => ({
  id: oid(900),
  name: "Outside Dhaka",
  baseCharge: 13000,
  baseWeightGrams: 1000,
  extraPerKg: 2000,
  codFeePercent: 0,
  freeAbove: 0,
  advanceRule: "none",
  courier: "none",
  minDays: 3,
  maxDays: 5,
  active: true,
  ...patch,
});

// 2 × ৳1,450 at 400 g each: 900 g with packaging → base charge.
const lines = [{ productId: oid(1), weightGrams: 400, qty: 2, price: 145000 }];
const totals = (method: PaymentMethod, z: Zone = zone()) =>
  checkoutTotals({ zone: z, rules: defaultRules(), lines, paymentMethod: method, now: NOW });

describe("checkout totals", () => {
  it("cash on delivery: everything at the door", () => {
    expect(totals("cod")).toMatchObject({
      subtotal: 290000,
      codFee: 0,
      total: 303000,
      advanceDue: 0,
      codAmount: 303000,
    });
  });

  it("delivery charge in advance: the rest at the door", () => {
    expect(totals("cod_advance")).toMatchObject({ total: 303000, advanceDue: 13000, codAmount: 290000 });
  });

  it("full advance: nothing at the door and no COD fee", () => {
    expect(totals("full", zone({ codFeePercent: 1 }))).toMatchObject({
      total: 303000,
      advanceDue: 303000,
      codAmount: 0,
      codFee: 0,
    });
  });

  it("the COD fee is a share of what the courier collects", () => {
    // 1% of ৳3,030 = ৳30.30 → ৳30
    expect(totals("cod", zone({ codFeePercent: 1 }))).toMatchObject({ codFee: 3000, total: 306000, codAmount: 306000 });
    // 1% of ৳2,900 = ৳29
    expect(totals("cod_advance", zone({ codFeePercent: 1 }))).toMatchObject({
      codFee: 2900,
      advanceDue: 13000,
      codAmount: 292900,
    });
  });

  it("free delivery counts the cart after discount", () => {
    const z = zone({ freeAbove: 290000 });
    expect(totals("cod", z).delivery.charge).toBe(0);
    const withDiscount = checkoutTotals({
      zone: z,
      rules: defaultRules(),
      lines,
      discount: 1000,
      paymentMethod: "cod",
      now: NOW,
    });
    expect(withDiscount.delivery.charge).toBe(13000);
    expect(withDiscount.total).toBe(290000 - 1000 + 13000);
  });

  it("offers only the payment methods the zone allows", () => {
    expect(allowedMethods("none")).toEqual(["cod", "full"]);
    expect(allowedMethods("delivery")).toEqual(["cod_advance", "full"]);
    expect(allowedMethods("full")).toEqual(["full"]);
  });

  it("finds the zone for an area, and none when the area or zone is off", () => {
    const lookup = {
      zones: [zone(), zone({ id: oid(901), active: false })],
      districts: [{ id: "d1", zoneId: oid(900) }],
      areas: [
        { id: "a1", districtId: "d1", zoneId: null, active: true },
        { id: "a2", districtId: "d1", zoneId: oid(901), active: true },
        { id: "a3", districtId: "d1", zoneId: null, active: false },
      ],
    };
    expect(zoneForArea(lookup, "a1")?.id).toBe(oid(900));
    expect(zoneForArea(lookup, "a2")).toBeNull();
    expect(zoneForArea(lookup, "a3")).toBeNull();
  });
});

const good = {
  name: "Rahim Uddin",
  phone: "01712-345678",
  email: "",
  districtId: oid(10),
  areaId: oid(11),
  address: "House 12, Road 5, Dhanmondi",
  note: "",
  paymentMethod: "cod",
  acceptTerms: true,
};

describe("checkout form", () => {
  it("accepts a good form and normalises the phone", () => {
    const r = checkoutInput.parse(good);
    expect(r.phone).toBe("+8801712345678");
    expect(r.email).toBe("");
  });

  it("names each problem next to its field", () => {
    const r = checkoutInput.safeParse({
      ...good,
      name: "R",
      phone: "12345",
      email: "nope",
      areaId: "",
      address: "short",
      paymentMethod: "bitcoin",
      acceptTerms: false,
    });
    expect(r.success).toBe(false);
    const f = fieldErrors(r.error!);
    expect(Object.keys(f).sort()).toEqual(
      ["acceptTerms", "address", "areaId", "email", "name", "paymentMethod", "phone"].sort(),
    );
    expect(f.phone).toMatch(/Bangladeshi/);
  });

  it("rejects operator objects and over-long text", () => {
    expect(checkoutInput.safeParse({ ...good, areaId: { $ne: "" } }).success).toBe(false);
    expect(checkoutInput.safeParse({ ...good, address: "x".repeat(251) }).success).toBe(false);
    expect(checkoutInput.safeParse({ ...good, phone: "+8801112345678" }).success).toBe(false);
  });
});
