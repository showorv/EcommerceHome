import { z } from "zod";
import { formatTaka } from "@/lib/money";
import type { CartLine } from "@/modules/cart/logic";

/**
 * Coupons (FR-CO-04, SRS §7 "coupons"). Pure and browser-safe: the checkout page works out the discount
 * live with these functions, and the server does it again from the saved coupon when the order is sent.
 * Money is integer poisha; the admin form sends taka.
 */

export const COUPON_TYPES = ["percent", "fixed", "free_delivery"] as const;
export type CouponType = (typeof COUPON_TYPES)[number];
export const COUPON_TYPE_NAMES: Record<CouponType, string> = {
  percent: "Percent off",
  fixed: "Amount off",
  free_delivery: "Free delivery",
};

export type Coupon = {
  id: string;
  code: string;
  type: CouponType;
  /** percent: 1–100; fixed: poisha; free_delivery: 0. */
  value: number;
  /** Cart value needed (poisha, before the discount). 0 = none. */
  minOrder: number;
  /** Most a percent coupon can take off (poisha). 0 = no cap. */
  maxDiscount: number;
  /** Orders in total. 0 = unlimited. */
  usageLimit: number;
  /** Orders per customer (by phone or account). 0 = unlimited. */
  perCustomerLimit: number;
  usedCount: number;
  startsAt: string | null;
  endsAt: string | null;
  /** Empty both = the whole store. */
  productIds: string[];
  categoryIds: string[];
  active: boolean;
  note: string;
};

/** What the checkout page needs to work out a coupon. Never the usage counts or the staff note. */
export type CouponTerms = Pick<
  Coupon,
  "code" | "type" | "value" | "minOrder" | "maxDiscount" | "startsAt" | "endsAt" | "productIds" | "categoryIds"
>;

// ---------- Codes ----------

/** Upper case, no spaces. 3–30 letters, digits, - or _. Null if it can't be a code. */
export function normalizeCouponCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z0-9_-]{3,30}$/.test(v) ? v : null;
}

// ---------- Admin input ----------

const taka = z.coerce
  .number({ error: "Enter an amount in taka" })
  .min(0, "Must be 0 or more")
  .max(1_000_000, "Too large")
  .transform((t) => Math.round(t * 100));

const count = z.coerce
  .number({ error: "Enter a number" })
  .int("Use a whole number")
  .min(0, "Must be 0 or more")
  .max(1_000_000, "Too large");

const when = z
  .union([z.iso.datetime({ offset: true }), z.literal(""), z.null()])
  .transform((v) => (v ? new Date(v).toISOString() : null))
  .default(null);

const ids = z
  .array(z.string().regex(/^[a-f0-9]{24}$/i))
  .max(500)
  .default([]);

export const couponInput = z
  .object({
    code: z.string().transform((v, ctx) => {
      const c = normalizeCouponCode(v);
      if (!c) {
        ctx.addIssue({ code: "custom", message: "Use 3–30 letters, digits, - or _ for the code" });
        return z.NEVER;
      }
      return c;
    }),
    type: z.enum(COUPON_TYPES),
    /** Percent for "percent", taka for "fixed"; ignored for free delivery. */
    value: z.coerce.number({ error: "Enter the discount" }).min(0).max(1_000_000).default(0),
    minOrder: taka.default(0),
    maxDiscount: taka.default(0),
    usageLimit: count.default(0),
    perCustomerLimit: count.default(1),
    startsAt: when,
    endsAt: when,
    productIds: ids,
    categoryIds: ids,
    active: z.boolean().default(true),
    note: z.string().trim().max(200, "Keep the note under 200 characters").default(""),
  })
  .superRefine((v, ctx) => {
    if (v.type === "percent" && (v.value < 1 || v.value > 100 || !Number.isInteger(v.value))) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Enter a whole percent from 1 to 100" });
    }
    if (v.type === "fixed" && v.value <= 0) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Enter the amount to take off" });
    }
    if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start" });
    }
  })
  .transform((v) => ({
    ...v,
    value: v.type === "percent" ? v.value : v.type === "fixed" ? Math.round(v.value * 100) : 0,
    maxDiscount: v.type === "percent" ? v.maxDiscount : 0,
  }));
export type CouponInput = z.output<typeof couponInput>;

// ---------- Status ----------

export type CouponStatus = "active" | "off" | "scheduled" | "expired" | "used_up";
export const COUPON_STATUS_NAMES: Record<CouponStatus, string> = {
  active: "Active",
  off: "Off",
  scheduled: "Scheduled",
  expired: "Expired",
  used_up: "Used up",
};

export function couponStatus(c: Coupon, now: number): CouponStatus {
  if (!c.active) return "off";
  if (c.endsAt && Date.parse(c.endsAt) <= now) return "expired";
  if (c.usageLimit > 0 && c.usedCount >= c.usageLimit) return "used_up";
  if (c.startsAt && Date.parse(c.startsAt) > now) return "scheduled";
  return "active";
}

/** "20% off (up to ৳300)", "৳150 off", "Free delivery". */
export function describeCoupon(c: Pick<Coupon, "type" | "value" | "maxDiscount">): string {
  if (c.type === "percent") return `${c.value}% off${c.maxDiscount > 0 ? ` (up to ${formatTaka(c.maxDiscount)})` : ""}`;
  if (c.type === "fixed") return `${formatTaka(c.value)} off`;
  return "Free delivery";
}

// ---------- Applying ----------

/** Categories with all their sub-categories, so a coupon for "Kitchen" also covers "Kitchen › Choppers". */
export function withSubcategories(ids: string[], all: { id: string; parentId: string | null }[]): string[] {
  const out = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of all) {
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return [...out];
}

type Line = Pick<CartLine, "productId" | "categoryIds" | "price" | "qty">;

export type CouponResult =
  { ok: true; discount: number; freeDelivery: boolean; eligibleSubtotal: number } | { ok: false; error: string };

/**
 * The discount a coupon gives on these cart lines (the ones that can be ordered). The minimum order
 * counts the whole cart; percent and amount-off coupons apply only to the products in scope. Percent
 * discounts are rounded to whole taka. Usage limits are checked on the server.
 */
export function applyCoupon(terms: CouponTerms, lines: Line[], now: number): CouponResult {
  if (terms.startsAt && Date.parse(terms.startsAt) > now) return { ok: false, error: "This code isn't active yet." };
  if (terms.endsAt && Date.parse(terms.endsAt) <= now) return { ok: false, error: "This code has expired." };

  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
  if (terms.minOrder > 0 && subtotal < terms.minOrder) {
    return {
      ok: false,
      error: `This code needs an order of ${formatTaka(terms.minOrder)}. Add ${formatTaka(terms.minOrder - subtotal)} more.`,
    };
  }

  const scoped = terms.productIds.length > 0 || terms.categoryIds.length > 0;
  const inScope = (l: Line) =>
    !scoped || terms.productIds.includes(l.productId) || l.categoryIds.some((c) => terms.categoryIds.includes(c));
  const eligibleSubtotal = lines.filter(inScope).reduce((n, l) => n + l.price * l.qty, 0);
  if (eligibleSubtotal === 0) return { ok: false, error: "This code doesn't cover the products in your cart." };

  if (terms.type === "free_delivery") return { ok: true, discount: 0, freeDelivery: true, eligibleSubtotal };
  let discount =
    terms.type === "percent"
      ? Math.round((eligibleSubtotal * terms.value) / 100 / 100) * 100
      : Math.min(terms.value, eligibleSubtotal);
  if (terms.type === "percent" && terms.maxDiscount > 0) discount = Math.min(discount, terms.maxDiscount);
  return { ok: true, discount: Math.min(discount, eligibleSubtotal), freeDelivery: false, eligibleSubtotal };
}
