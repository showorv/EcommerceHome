import { z } from "zod";
import { normalizeBdPhone } from "@/lib/phone";
import { normalizeTrxId, WALLET_NAMES, WALLET_TYPES, type WalletType } from "@/modules/payments/payments";
import type { CartLine } from "@/modules/cart/logic";
import {
  codFee,
  deliveryQuote,
  zoneIdFor,
  type AdvanceRule,
  type DeliveryQuote,
  type DeliveryRules,
  type Zone,
  type ZoneLookup,
} from "@/modules/delivery/charge";

/**
 * Checkout (FR-CO-02, SRS §2.2–2.3). Pure and browser-safe: the page shows these totals live, and the
 * server works them out again from the saved cart and settings when the form is sent. The browser's
 * numbers are never trusted.
 */

// ---------- Payment methods (SRS §2.1) ----------

export const PAYMENT_METHODS = ["cod", "cod_advance", "full"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_NAMES: Record<PaymentMethod, string> = {
  cod: "Cash on delivery",
  cod_advance: "Delivery charge now, rest on delivery",
  full: "Pay everything now",
};

/** What a zone's advance rule lets the shopper choose, best first. */
export function allowedMethods(rule: AdvanceRule): PaymentMethod[] {
  if (rule === "full") return ["full"];
  if (rule === "delivery") return ["cod_advance", "full"];
  return ["cod", "full"];
}

export const needsAdvance = (m: PaymentMethod) => m !== "cod";

/**
 * What the shopper can actually choose: the zone's options, minus the advance ones while no bKash /
 * Nagad wallet is switched on in Admin → Payments. Empty means the area can't order for now.
 */
export function availableMethods(rule: AdvanceRule, walletCount: number): PaymentMethod[] {
  return allowedMethods(rule).filter((m) => walletCount > 0 || !needsAdvance(m));
}

// ---------- The form ----------

/** Required text: "Enter …" when empty, "… is too short" when only a little was typed. */
const text = (min: number, max: number, label: string, what: string) =>
  z
    .string({ error: `Enter ${label}` })
    .trim()
    .min(1, `Enter ${label}`)
    .min(min, `${what} is too short`)
    .max(max, `${what} is too long`);

const pick = (message: string) => z.string({ error: message }).regex(/^[a-f0-9]{24}$/i, message);

const checkoutFields = z.object({
  name: text(2, 80, "your full name", "The name"),
  phone: z
    .string({ error: "Enter your mobile number" })
    .trim()
    .transform((v, ctx) => {
      const p = normalizeBdPhone(v);
      if (!p) {
        const message = v ? "Enter a Bangladeshi mobile number, like 01712345678" : "Enter your mobile number";
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return p;
    }),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || z.email().safeParse(v).success, "Check the email address")
    .default(""),
  districtId: pick("Choose your district"),
  areaId: pick("Choose your area"),
  address: text(10, 250, "the full address", "The address"),
  note: z.string().trim().max(250, "The note is too long").default(""),
  paymentMethod: z.enum(PAYMENT_METHODS, { error: "Choose how you'll pay" }),
  /** Advance payments only (SRS §2.2): the wallet paid into, the number it was sent from, and the TrxID. */
  payWallet: z.union([z.enum(WALLET_TYPES), z.literal("")]).default(""),
  senderNumber: z
    .string()
    .trim()
    .max(20)
    .default("")
    .transform((v) => normalizeBdPhone(v) ?? v),
  trxId: z
    .string()
    .trim()
    .max(30)
    .default("")
    .transform((v) => normalizeTrxId(v) ?? v),
  acceptTerms: z.literal(true, { error: "Please accept the terms and return policy" }),
});

export const checkoutInput = checkoutFields
  .superRefine((v, ctx) => {
    if (!needsAdvance(v.paymentMethod)) return;
    const wallet = v.payWallet ? WALLET_NAMES[v.payWallet] : "wallet";
    if (!v.payWallet) ctx.addIssue({ code: "custom", path: ["payWallet"], message: "Choose bKash or Nagad" });
    if (!normalizeBdPhone(v.senderNumber)) {
      ctx.addIssue({
        code: "custom",
        path: ["senderNumber"],
        message: v.senderNumber
          ? "Enter a Bangladeshi mobile number, like 01712345678"
          : `Enter the ${wallet} number you sent from`,
      });
    }
    if (!normalizeTrxId(v.trxId)) {
      ctx.addIssue({
        code: "custom",
        path: ["trxId"],
        message: v.trxId
          ? "Check the TrxID: 8–12 letters and digits, as in the payment SMS"
          : `Enter the TrxID from the ${wallet} SMS`,
      });
    }
  })
  // Cash on delivery: nothing to keep from the advance fields.
  .transform((v) =>
    needsAdvance(v.paymentMethod) ? v : { ...v, payWallet: "" as const, senderNumber: "", trxId: "" },
  );
export type CheckoutInput = z.infer<typeof checkoutInput>;
export type { WalletType };
export type CheckoutField = keyof CheckoutInput;

/** Field → first problem, for showing errors next to each field. */
export function fieldErrors(err: z.ZodError): Partial<Record<CheckoutField, string>> {
  const out: Partial<Record<CheckoutField, string>> = {};
  for (const i of err.issues) {
    const k = i.path[0] as CheckoutField | undefined;
    if (k && !out[k]) out[k] = i.message;
  }
  return out;
}

// ---------- Totals ----------

export type CheckoutTotals = {
  subtotal: number;
  discount: number;
  delivery: DeliveryQuote;
  codFee: number;
  total: number;
  /** Paid now by bKash or Nagad (0 for cash on delivery). */
  advanceDue: number;
  /** Collected by the courier at the door. */
  codAmount: number;
  paymentMethod: PaymentMethod;
};

/**
 * Everything the order summary shows. `lines` are the cart lines that can be ordered. The COD fee is a
 * share of what the courier collects at the door, so it is 0 when everything is paid in advance.
 */
export function checkoutTotals(input: {
  zone: Zone;
  rules: DeliveryRules;
  lines: Pick<CartLine, "productId" | "weightGrams" | "qty" | "price">[];
  discount?: number;
  paymentMethod: PaymentMethod;
  now: number;
}): CheckoutTotals {
  const { zone, rules, lines, paymentMethod, now } = input;
  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
  const discount = Math.min(subtotal, Math.max(0, input.discount ?? 0));
  const goods = subtotal - discount;
  const delivery = deliveryQuote({ zone, rules, lines, subtotal: goods, now });
  const advanceDue =
    paymentMethod === "full" ? goods + delivery.charge : paymentMethod === "cod_advance" ? delivery.charge : 0;
  const atDoor = goods + delivery.charge - advanceDue;
  const fee = codFee(atDoor, zone.codFeePercent);
  return {
    subtotal,
    discount,
    delivery,
    codFee: fee,
    total: goods + delivery.charge + fee,
    advanceDue,
    codAmount: atDoor + fee,
    paymentMethod,
  };
}

/** The zone for an area, if shoppers can order there (area and zone switched on). */
export function zoneForArea(lookup: ZoneLookup & { zones: Zone[] }, areaId: string): Zone | null {
  const id = zoneIdFor(lookup, areaId);
  const zone = id ? lookup.zones.find((z) => z.id === id) : undefined;
  return zone && zone.active ? zone : null;
}
