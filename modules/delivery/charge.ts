import { z } from "zod";
import { percentOf, type Poisha } from "@/lib/money";

/**
 * Delivery zones, delivery rules and the delivery charge (FR-AD-08, SRS §2.3). Pure and browser-safe:
 * the admin editor, the checkout (2.3) and the server's re-check at order placement all use the same
 * calculation, so the number a shopper sees is the number the order is saved with.
 *
 * Money is integer poisha. Admin forms send taka; the schemas convert.
 */

const taka = z.coerce
  .number({ error: "Enter an amount in taka" })
  .min(0, "Must be 0 or more")
  .max(1_000_000, "Too large")
  .transform((t) => Math.round(t * 100));

const whenField = z
  .union([z.iso.datetime({ offset: true }), z.literal(""), z.null()])
  .transform((v) => (v ? new Date(v).toISOString() : null))
  .default(null);

export const ADVANCE_RULES = ["none", "delivery", "full"] as const;
export type AdvanceRule = (typeof ADVANCE_RULES)[number];
export const ADVANCE_RULE_NAMES: Record<AdvanceRule, string> = {
  none: "Not needed (cash on delivery)",
  delivery: "Delivery charge in advance",
  full: "Full amount in advance",
};

export const COURIERS = ["none", "steadfast", "pathao", "redx"] as const;
export type Courier = (typeof COURIERS)[number];
export const COURIER_NAMES: Record<Courier, string> = {
  none: "Decide per order",
  steadfast: "Steadfast",
  pathao: "Pathao",
  redx: "RedX",
};

/** A zone as the admin edits it (taka in, poisha out). */
export const zoneInput = z
  .object({
    name: z.string().trim().min(2, "Give the zone a name").max(60),
    /** Charge for the first `baseWeightGrams` (usually 1 kg). */
    baseCharge: taka,
    baseWeightGrams: z.coerce.number().int().min(100, "At least 100 g").max(50_000).default(1000),
    /** Added for every started kg above the base weight. */
    extraPerKg: taka,
    /** COD handling fee as a % of the amount collected at the door (0 = none). */
    codFeePercent: z.coerce.number().min(0).max(10, "At most 10%").default(0),
    /** Free delivery when the cart (after discount) reaches this much; 0 = use the store-wide rule. */
    freeAbove: taka.default(0),
    advanceRule: z.enum(ADVANCE_RULES).default("none"),
    courier: z.enum(COURIERS).default("none"),
    minDays: z.coerce.number().int().min(0).max(30).default(1),
    maxDays: z.coerce.number().int().min(0).max(30).default(3),
    active: z.boolean().default(true),
  })
  .refine((v) => v.maxDays >= v.minDays, { message: "The latest day can't be before the earliest", path: ["maxDays"] });
export type ZoneInput = z.infer<typeof zoneInput>;

export type Zone = ZoneInput & { id: string };

/** Store-wide delivery rules (one document). */
export const rulesInput = z
  .object({
    /** Box and wrapping, added to every order's weight. */
    packagingGrams: z.coerce.number().int().min(0).max(5000).default(100),
    /** Free delivery everywhere above this cart value; 0 = off. A zone's own threshold wins. */
    freeAbove: taka.default(0),
    /** Orders made up only of these products ship free. */
    freeProductIds: z
      .array(z.string().regex(/^[a-f0-9]{24}$/i))
      .max(500)
      .default([]),
    /** Campaign: one flat charge everywhere for a while (free-delivery rules still apply). */
    flat: z
      .object({
        enabled: z.boolean().default(false),
        charge: taka.default(0),
        startAt: whenField,
        endAt: whenField,
      })
      .refine((f) => !f.startAt || !f.endAt || f.startAt < f.endAt, {
        message: "The campaign must end after it starts",
        path: ["endAt"],
      })
      .default({ enabled: false, charge: 0, startAt: null, endAt: null }),
  })
  .default({
    packagingGrams: 100,
    freeAbove: 0,
    freeProductIds: [],
    flat: { enabled: false, charge: 0, startAt: null, endAt: null },
  });
export type DeliveryRules = z.infer<typeof rulesInput>;

export const defaultRules = (): DeliveryRules => rulesInput.parse(undefined);

/**
 * Rules as stored (already poisha). Never re-parse stored rules with rulesInput: it reads taka and
 * would multiply every amount by 100. Anything malformed falls back to its default.
 */
export function readRules(raw: unknown): DeliveryRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const f = (r.flat && typeof r.flat === "object" ? r.flat : {}) as Record<string, unknown>;
  const int = (v: unknown, max: number, fallback: number) => {
    const n = Number(v);
    return v !== null && v !== "" && Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), max) : fallback;
  };
  const when = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);
  const ids = Array.isArray(r.freeProductIds)
    ? r.freeProductIds.filter((id): id is string => typeof id === "string" && /^[a-f0-9]{24}$/i.test(id))
    : [];
  return {
    packagingGrams: int(r.packagingGrams, 5000, 100),
    freeAbove: int(r.freeAbove, 100_000_000, 0),
    freeProductIds: [...new Set(ids)].slice(0, 500),
    flat: {
      enabled: f.enabled === true,
      charge: int(f.charge, 100_000_000, 0),
      startAt: when(f.startAt),
      endAt: when(f.endAt),
    },
  };
}

/** Is the flat-rate campaign on at `now`? */
export function flatActive(flat: DeliveryRules["flat"], now: number): boolean {
  if (!flat.enabled) return false;
  if (flat.startAt && Date.parse(flat.startAt) > now) return false;
  if (flat.endAt && Date.parse(flat.endAt) <= now) return false;
  return true;
}

// ---------- The charge ----------

export type ChargeLine = { productId: string; weightGrams: number; qty: number };

export type DeliveryQuote = {
  /** What the shopper pays for delivery (poisha). */
  charge: Poisha;
  /** Items plus packaging. */
  weightGrams: number;
  /** Why the charge is what it is. */
  reason: "weight" | "flat" | "free-threshold" | "free-products";
  /** The weight-based price before any free / flat rule (for "you saved ৳…"). */
  regularCharge: Poisha;
  /** Cart value at which delivery becomes free here, or null when there's no such rule. */
  freeAbove: Poisha | null;
  codFeePercent: number;
  minDays: number;
  maxDays: number;
};

type ChargeZone = Pick<
  Zone,
  "baseCharge" | "baseWeightGrams" | "extraPerKg" | "freeAbove" | "codFeePercent" | "minDays" | "maxDays"
>;

/** Base charge, plus `extraPerKg` for every started kg above the base weight. */
export function weightCharge(zone: Pick<Zone, "baseCharge" | "baseWeightGrams" | "extraPerKg">, grams: number) {
  const extraKg = Math.ceil(Math.max(0, grams - zone.baseWeightGrams) / 1000);
  return zone.baseCharge + extraKg * zone.extraPerKg;
}

/**
 * The delivery charge for a cart going to a zone. `subtotal` is the cart value after discounts.
 * Order of rules: free delivery (only free-delivery products, or above the threshold) → flat-rate
 * campaign → weight-based charge.
 */
export function deliveryQuote(input: {
  zone: ChargeZone;
  rules: DeliveryRules;
  lines: ChargeLine[];
  subtotal: Poisha;
  now: number;
}): DeliveryQuote {
  const { zone, rules, lines, subtotal, now } = input;
  const itemGrams = lines.reduce((sum, l) => sum + Math.max(0, l.weightGrams) * Math.max(0, l.qty), 0);
  const weightGrams = itemGrams + rules.packagingGrams;
  const regularCharge = weightCharge(zone, weightGrams);
  const threshold = zone.freeAbove > 0 ? zone.freeAbove : rules.freeAbove > 0 ? rules.freeAbove : null;
  const base = {
    weightGrams,
    regularCharge,
    freeAbove: threshold,
    codFeePercent: zone.codFeePercent,
    minDays: zone.minDays,
    maxDays: zone.maxDays,
  };

  const free = new Set(rules.freeProductIds);
  const buying = lines.filter((l) => l.qty > 0);
  if (buying.length > 0 && buying.every((l) => free.has(l.productId))) {
    return { ...base, charge: 0, reason: "free-products" };
  }
  if (threshold !== null && subtotal >= threshold) return { ...base, charge: 0, reason: "free-threshold" };
  if (flatActive(rules.flat, now)) return { ...base, charge: rules.flat.charge, reason: "flat" };
  return { ...base, charge: regularCharge, reason: "weight" };
}

/** COD handling fee on the amount collected at the door, rounded to whole taka. */
export function codFee(codAmount: Poisha, percent: number): Poisha {
  if (percent <= 0 || codAmount <= 0) return 0;
  return Math.round(percentOf(codAmount, percent) / 100) * 100;
}

// ---------- Which zone ----------

export type ZoneLookup = {
  districts: { id: string; zoneId: string | null }[];
  areas: { id: string; districtId: string; zoneId: string | null; active: boolean }[];
};

/** An area's zone: its own, else its district's. Null when nothing is set or the area is switched off. */
export function zoneIdFor(lookup: ZoneLookup, areaId: string): string | null {
  const area = lookup.areas.find((a) => a.id === areaId);
  if (!area || !area.active) return null;
  if (area.zoneId) return area.zoneId;
  return lookup.districts.find((d) => d.id === area.districtId)?.zoneId ?? null;
}
