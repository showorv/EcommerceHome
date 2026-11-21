import { describe, expect, it } from "vitest";
import { requiredPermission } from "@/modules/auth/admin-routes";
import { can } from "@/modules/auth/rbac";
import {
  codFee,
  defaultRules,
  deliveryQuote,
  flatActive,
  readRules,
  rulesInput,
  weightCharge,
  zoneIdFor,
  zoneInput,
  type DeliveryRules,
} from "@/modules/delivery/charge";
import {
  DHAKA_SUBURB_AREAS,
  DISTRICTS,
  DIVISIONS,
  splitName,
  STARTER_ZONES,
  SUBURB_DISTRICTS,
} from "@/modules/delivery/locations-data";

describe("Bangladesh location data", () => {
  it("has 8 divisions and 64 districts, each in a known division", () => {
    expect(DIVISIONS).toHaveLength(8);
    expect(DISTRICTS).toHaveLength(64);
    const keys = new Set(DIVISIONS.map((d) => d.key));
    for (const d of DISTRICTS) expect(keys.has(d.division)).toBe(true);
    expect(new Set(DISTRICTS.map((d) => d.en)).size).toBe(64);
  });

  it("every district and area has an English and a Bangla name, no duplicates within a district", () => {
    for (const d of DISTRICTS) {
      expect(d.bn, d.en).not.toBe("");
      expect(d.areas.length, d.en).toBeGreaterThan(0);
      const names = d.areas.map(splitName);
      for (const n of names) {
        expect(n.en.length, `${d.en}: ${n.en}`).toBeGreaterThan(1);
        expect(n.bn.length, `${d.en}: ${n.en}`).toBeGreaterThan(0);
      }
      const en = names.map((n) => n.en.toLowerCase());
      expect(new Set(en).size, d.en).toBe(en.length);
    }
  });

  it("the starter suburbs exist", () => {
    const dhaka = DISTRICTS.find((d) => d.en === "Dhaka")!.areas.map((p) => splitName(p).en);
    for (const s of DHAKA_SUBURB_AREAS) expect(dhaka).toContain(s);
    for (const s of SUBURB_DISTRICTS) expect(DISTRICTS.some((d) => d.en === s)).toBe(true);
    expect(STARTER_ZONES).toHaveLength(3);
  });
});

const zone = {
  baseCharge: 7000,
  baseWeightGrams: 1000,
  extraPerKg: 1500,
  freeAbove: 0,
  codFeePercent: 1,
  minDays: 1,
  maxDays: 2,
};
const rules = (patch: Partial<DeliveryRules> = {}): DeliveryRules => ({ ...defaultRules(), ...patch });
const NOW = Date.parse("2026-11-21T06:00:00Z");
const line = (grams: number, qty = 1, productId = "a".repeat(24)) => ({ productId, weightGrams: grams, qty });

describe("delivery charge", () => {
  it("charges the base up to the base weight, then per started kg", () => {
    expect(weightCharge(zone, 0)).toBe(7000);
    expect(weightCharge(zone, 1000)).toBe(7000);
    expect(weightCharge(zone, 1001)).toBe(8500);
    expect(weightCharge(zone, 3000)).toBe(10000);
    expect(weightCharge(zone, 3200)).toBe(11500);
  });

  it("adds packaging weight", () => {
    const q = deliveryQuote({ zone, rules: rules(), lines: [line(950)], subtotal: 100000, now: NOW });
    expect(q.weightGrams).toBe(1050);
    expect(q.charge).toBe(8500);
    expect(q.reason).toBe("weight");
  });

  it("is free above the store-wide threshold; a zone's own threshold wins", () => {
    const r = rules({ freeAbove: 300000 });
    expect(deliveryQuote({ zone, rules: r, lines: [line(500)], subtotal: 300000, now: NOW }).charge).toBe(0);
    expect(deliveryQuote({ zone, rules: r, lines: [line(500)], subtotal: 299999, now: NOW }).charge).toBe(7000);
    const own = { ...zone, freeAbove: 500000 };
    const q = deliveryQuote({ zone: own, rules: r, lines: [line(500)], subtotal: 300000, now: NOW });
    expect(q.charge).toBe(7000);
    expect(q.freeAbove).toBe(500000);
  });

  it("is free only when every product in the cart ships free", () => {
    const free = "f".repeat(24);
    const r = rules({ freeProductIds: [free] });
    const only = deliveryQuote({ zone, rules: r, lines: [line(500, 2, free)], subtotal: 1000, now: NOW });
    expect(only).toMatchObject({ charge: 0, reason: "free-products", regularCharge: 8500 });
    const mixed = deliveryQuote({ zone, rules: r, lines: [line(500, 1, free), line(500)], subtotal: 1000, now: NOW });
    expect(mixed.reason).toBe("weight");
  });

  it("uses the flat campaign only while it runs; free rules still win", () => {
    const flat = {
      enabled: true,
      charge: 4900,
      startAt: "2026-11-20T00:00:00.000Z",
      endAt: "2026-11-22T00:00:00.000Z",
    };
    const r = rules({ flat, freeAbove: 200000 });
    expect(deliveryQuote({ zone, rules: r, lines: [line(4000)], subtotal: 1000, now: NOW })).toMatchObject({
      charge: 4900,
      reason: "flat",
    });
    expect(deliveryQuote({ zone, rules: r, lines: [line(4000)], subtotal: 200000, now: NOW }).charge).toBe(0);
    expect(flatActive(flat, Date.parse("2026-11-22T00:00:00Z"))).toBe(false);
    expect(flatActive(flat, Date.parse("2026-11-19T23:59:59Z"))).toBe(false);
    expect(flatActive({ ...flat, enabled: false }, NOW)).toBe(false);
  });

  it("rounds the COD fee to whole taka", () => {
    expect(codFee(123456, 1)).toBe(1200);
    expect(codFee(125000, 1)).toBe(1300);
    expect(codFee(100000, 0)).toBe(0);
    expect(codFee(0, 2)).toBe(0);
  });
});

describe("which zone", () => {
  const lookup = {
    districts: [
      { id: "d1", zoneId: "outside" },
      { id: "d2", zoneId: null },
    ],
    areas: [
      { id: "a1", districtId: "d1", zoneId: null, active: true },
      { id: "a2", districtId: "d1", zoneId: "inside", active: true },
      { id: "a3", districtId: "d1", zoneId: "inside", active: false },
      { id: "a4", districtId: "d2", zoneId: null, active: true },
    ],
  };
  it("uses the area's own zone, else the district's, and nothing for switched-off areas", () => {
    expect(zoneIdFor(lookup, "a1")).toBe("outside");
    expect(zoneIdFor(lookup, "a2")).toBe("inside");
    expect(zoneIdFor(lookup, "a3")).toBeNull();
    expect(zoneIdFor(lookup, "a4")).toBeNull();
    expect(zoneIdFor(lookup, "missing")).toBeNull();
  });
});

describe("admin forms", () => {
  it("zone form takes taka and stores poisha", () => {
    const z = zoneInput.parse({ name: "Inside Dhaka", baseCharge: "70", extraPerKg: "15.5", minDays: 1, maxDays: 2 });
    expect(z).toMatchObject({ baseCharge: 7000, extraPerKg: 1550, freeAbove: 0, advanceRule: "none", active: true });
    expect(zoneInput.safeParse({ name: "X", baseCharge: 70, extraPerKg: 0 }).success).toBe(false);
    expect(zoneInput.safeParse({ name: "Zone", baseCharge: 70, extraPerKg: 0, minDays: 3, maxDays: 2 }).success).toBe(
      false,
    );
    expect(zoneInput.safeParse({ name: "Zone", baseCharge: -1, extraPerKg: 0 }).success).toBe(false);
  });

  it("rules form converts taka, and stored rules are read back unchanged", () => {
    const saved = rulesInput.parse({
      packagingGrams: "150",
      freeAbove: "3000",
      freeProductIds: ["b".repeat(24)],
      flat: { enabled: true, charge: "49", startAt: "2026-11-20T00:00:00.000Z", endAt: null },
    });
    expect(saved.freeAbove).toBe(300000);
    expect(saved.flat.charge).toBe(4900);
    expect(readRules(saved)).toEqual(saved);
    expect(readRules(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it("rejects bad rules and falls back on malformed stored ones", () => {
    expect(rulesInput.safeParse({ freeProductIds: ["nope"] }).success).toBe(false);
    expect(
      rulesInput.safeParse({
        flat: { enabled: true, charge: 1, startAt: "2026-11-22T00:00:00Z", endAt: "2026-11-21T00:00:00Z" },
      }).success,
    ).toBe(false);
    expect(readRules(null)).toEqual(defaultRules());
    expect(readRules({ packagingGrams: -5, freeAbove: "x", flat: { charge: -10, startAt: "bad" } })).toEqual(
      defaultRules(),
    );
  });

  it("only zones.manage can open Admin → Delivery", () => {
    expect(requiredPermission("/admin/delivery")).toBe("zones.manage");
    expect(can({ role: "manager" }, "zones.manage")).toBe(true);
    expect(can({ role: "staff" }, "zones.manage")).toBe(false);
  });
});
