import { z } from "zod";
import { normalizeBdPhone } from "@/lib/phone";
import type { PaymentMethod } from "@/modules/checkout/checkout";
import { normalizeTrxId, WALLET_NAMES, WALLET_TYPES, type WalletType } from "@/modules/payments/payments";
import { ORDER_SOURCE_NAMES, type NewOrder, type OrderItem } from "./orders";
import type { Risk } from "./risk";
import { editedTotals, type EditTotals } from "./staff";

export { ORDER_SOURCE_NAMES, ORDER_SOURCES, type OrderSource } from "./orders";

/**
 * Manual orders (Open question 9): orders staff take in a Facebook or WhatsApp chat, or on a call, and
 * type in from admin. Pure and browser-safe. They then go through the same steps as website orders:
 * pending → confirmed (with its invoice) → packed → shipped. Saving is in manual-place.ts.
 */

/** What staff can choose on the form (website orders only come from checkout). */
export const MANUAL_SOURCES = ["facebook", "whatsapp", "phone", "other"] as const;
export type ManualSource = (typeof MANUAL_SOURCES)[number];

export const MANUAL_MAX_LINES = 30;
export const MANUAL_MAX_QTY = 99;

const takaText = (label: string) =>
  z
    .string()
    .trim()
    .max(12)
    .default("")
    .refine((v) => v === "" || /^\d{1,7}(\.\d{1,2})?$/.test(v), `${label}: an amount in taka, like 120 or 99.50`)
    .transform((v) => (v === "" ? null : Math.round(Number(v) * 100)));

const objectId = (message: string) => z.string({ error: message }).regex(/^[a-f0-9]{24}$/i, message);

export const manualOrderInput = z
  .object({
    key: z.uuid({ error: "Please reload the page and try again." }),
    source: z.enum(MANUAL_SOURCES, { error: "Choose where the order came from" }),
    name: z.string().trim().min(2, "Enter the customer's name").max(80, "The name is too long"),
    phone: z
      .string()
      .trim()
      .transform((v, ctx) => {
        const p = normalizeBdPhone(v);
        if (!p) {
          ctx.addIssue({ code: "custom", message: "Enter a Bangladeshi mobile number, like 01712345678" });
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
    districtId: objectId("Choose the district"),
    areaId: objectId("Choose the area"),
    address: z.string().trim().min(10, "Enter the full address").max(250, "The address is too long"),
    note: z.string().trim().max(250, "The delivery note is too long").default(""),
    items: z
      .array(
        z.object({
          variantId: objectId("A product in the list is not valid"),
          qty: z.coerce.number().int().min(1).max(MANUAL_MAX_QTY, `At most ${MANUAL_MAX_QTY} of one product`),
        }),
      )
      .min(1, "Add at least one product")
      .max(MANUAL_MAX_LINES, `At most ${MANUAL_MAX_LINES} products in one order`)
      .refine((l) => new Set(l.map((i) => i.variantId)).size === l.length, "A product is in the list twice"),
    discount: takaText("Discount"),
    /** Empty = the zone's charge for this order. */
    deliveryCharge: takaText("Delivery charge"),
    /** An advance the customer already sent (bKash / Nagad), checked later like any other. */
    payWallet: z.union([z.enum(WALLET_TYPES), z.literal("")]).default(""),
    senderNumber: z.string().trim().max(20).default(""),
    trxId: z.string().trim().max(30).default(""),
    advanceAmount: takaText("Advance"),
    staffNote: z.string().trim().max(500, "The note is too long").default(""),
  })
  .superRefine((v, ctx) => {
    if (!v.payWallet) return;
    const wallet = WALLET_NAMES[v.payWallet];
    if (!normalizeBdPhone(v.senderNumber)) {
      ctx.addIssue({ code: "custom", path: ["senderNumber"], message: `Enter the ${wallet} number it came from` });
    }
    if (!normalizeTrxId(v.trxId)) {
      ctx.addIssue({ code: "custom", path: ["trxId"], message: "Check the TrxID: 8–12 letters and digits" });
    }
    if (!v.advanceAmount || v.advanceAmount <= 0) {
      ctx.addIssue({ code: "custom", path: ["advanceAmount"], message: "Enter the amount received" });
    }
  })
  .transform((v) => ({
    ...v,
    senderNumber: v.payWallet ? (normalizeBdPhone(v.senderNumber) ?? v.senderNumber) : "",
    trxId: v.payWallet ? (normalizeTrxId(v.trxId) ?? v.trxId) : "",
    advanceAmount: v.payWallet ? (v.advanceAmount ?? 0) : 0,
    discount: v.discount ?? 0,
  }));
export type ManualOrderInput = z.infer<typeof manualOrderInput>;
export type ManualField = keyof ManualOrderInput;

/** Field → first problem. */
export function manualFieldErrors(err: z.ZodError): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? "");
    if (k && !out[k]) out[k] = i.message;
  }
  return out;
}

/** How the order is paid: nothing sent yet, part of it, or all of it. */
export function manualPaymentMethod(advancePaid: number, total: number): PaymentMethod {
  if (advancePaid <= 0) return "cod";
  return advancePaid >= total ? "full" : "cod_advance";
}

/** Totals like an edited order: staff set the discount and delivery charge; the advance comes off the door amount. */
export function manualTotals(input: {
  items: Pick<OrderItem, "price" | "qty">[];
  discount: number;
  deliveryCharge: number;
  codFeePercent: number;
  advancePaid: number;
}): EditTotals {
  return editedTotals(input);
}

export function buildManualOrder(input: {
  orderNo: string;
  idempotencyKey: string;
  form: ManualOrderInput;
  items: OrderItem[];
  totals: EditTotals;
  zone: { id: string; name: string };
  district: string;
  area: string;
  /** What the zone charges, for the record when staff charged something else. */
  quote: { charge: number; reason: string; weightGrams: number; minDays: number; maxDays: number };
  risk: Risk;
  by: { id: string; name: string };
  now: Date;
  reservationHours: number;
}): Omit<NewOrder, "source"> & { source: ManualSource } {
  const { form: f, totals: t, now } = input;
  const advance =
    f.payWallet && f.advanceAmount > 0
      ? {
          method: f.payWallet as WalletType,
          senderNumber: f.senderNumber,
          trxId: f.trxId,
          amount: f.advanceAmount,
          status: "pending" as const,
        }
      : null;
  return {
    orderNo: input.orderNo,
    userId: null,
    customer: { name: f.name, phone: f.phone, email: f.email },
    shippingAddress: {
      districtId: f.districtId,
      district: input.district,
      areaId: f.areaId,
      area: input.area,
      line: f.address,
      note: f.note,
    },
    zoneId: input.zone.id,
    zoneName: input.zone.name,
    items: input.items,
    subtotal: t.subtotal,
    discount: t.discount,
    couponCode: null,
    deliveryCharge: t.deliveryCharge,
    delivery: {
      reason: t.deliveryCharge === input.quote.charge ? input.quote.reason : "staff",
      regularCharge: input.quote.charge,
      weightGrams: input.quote.weightGrams,
      minDays: input.quote.minDays,
      maxDays: input.quote.maxDays,
    },
    codFee: t.codFee,
    total: t.total,
    paymentMethod: manualPaymentMethod(t.advancePaid, t.total),
    advance,
    codAmount: t.codAmount,
    paymentStatus: advance ? "advance_pending" : "unpaid",
    status: "pending",
    statusHistory: [
      {
        status: "pending",
        at: now,
        by: input.by.id,
        byName: input.by.name,
        note: `Taken by ${input.by.name} from ${ORDER_SOURCE_NAMES[f.source]}`,
      },
    ],
    reservation: {
      active: true,
      until: new Date(now.getTime() + input.reservationHours * 3600_000),
      releasedAt: null,
    },
    riskScore: input.risk.score,
    riskLevel: input.risk.level,
    riskReasons: input.risk.reasons,
    source: f.source,
    idempotencyKey: input.idempotencyKey,
    ip: null,
    userAgent: null,
    createdAt: now,
  };
}
