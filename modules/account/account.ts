import { z } from "zod";
import { normalizeBdPhone } from "@/lib/phone";
import { isOrderNo, ORDER_NO_PREFIX, type OrderStatus, type PaymentStatus } from "@/modules/orders/orders";

/**
 * The customer's account area and guest tracking (FR-AC-06/07). Pure and browser-safe: the address
 * form, who an order belongs to, and the words and steps a customer sees for their order. Staff names,
 * notes, cost prices and risk never reach this side.
 */

// ---------- Saved addresses ----------

export const MAX_ADDRESSES = 10;
export const MAX_WISHLIST = 200;

const objectId = (message: string) => z.string({ error: message }).regex(/^[a-f0-9]{24}$/i, message);

const phoneField = z
  .string({ error: "Enter the mobile number" })
  .trim()
  .transform((v, ctx) => {
    const p = normalizeBdPhone(v);
    if (!p) {
      ctx.addIssue({
        code: "custom",
        message: v ? "Enter a Bangladeshi mobile number, like 01712345678" : "Enter the mobile number",
      });
      return z.NEVER;
    }
    return p;
  });

export const addressInput = z.object({
  label: z.string().trim().max(30, "Keep the name under 30 characters").default(""),
  name: z
    .string({ error: "Enter the name" })
    .trim()
    .min(1, "Enter the name")
    .min(2, "The name is too short")
    .max(80, "The name is too long"),
  phone: phoneField,
  districtId: objectId("Choose the district"),
  areaId: objectId("Choose the area"),
  line: z
    .string({ error: "Enter the full address" })
    .trim()
    .min(1, "Enter the full address")
    .min(10, "The address is too short")
    .max(250, "The address is too long"),
  note: z.string().trim().max(250, "The note is too long").default(""),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressInput>;
export type AddressField = keyof AddressInput;

export type SavedAddress = AddressInput & {
  id: string;
  /** "Adabor, Dhaka", from the delivery settings (empty if the area was removed). */
  place: string;
};

/** The same place and person, ignoring spaces and case: no need to save it twice. */
export function sameAddress(
  a: Pick<AddressInput, "name" | "phone" | "districtId" | "areaId" | "line">,
  b: Pick<AddressInput, "name" | "phone" | "districtId" | "areaId" | "line">,
): boolean {
  const t = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return (
    a.phone === b.phone &&
    a.districtId === b.districtId &&
    a.areaId === b.areaId &&
    t(a.name) === t(b.name) &&
    t(a.line) === t(b.line)
  );
}

export function addressFieldErrors(err: z.ZodError): Partial<Record<AddressField, string>> {
  const out: Partial<Record<AddressField, string>> = {};
  for (const i of err.issues) {
    const k = i.path[0] as AddressField | undefined;
    if (k && !out[k]) out[k] = i.message;
  }
  return out;
}

// ---------- Whose order is it ----------

/**
 * An order is yours when you placed it signed in, or when it was placed (as a guest) with the mobile
 * number your account has confirmed with a code. An unconfirmed number never counts.
 */
export function ownsOrder(
  order: { userId: string | null; phone: string },
  user: { id: string; phoneNumber?: string | null; phoneNumberVerified?: boolean | null },
): boolean {
  if (order.userId && order.userId === user.id) return true;
  return Boolean(user.phoneNumberVerified && user.phoneNumber && order.phone === user.phoneNumber);
}

// ---------- Guest tracking ----------

/** "SR10234", "sr 10234", "#SR10234" or just "10234". */
export function normalizeOrderNo(v: string): string | null {
  const s = v
    .trim()
    .toUpperCase()
    .replace(/[\s#-]/g, "");
  const full = /^\d{5,9}$/.test(s) ? `${ORDER_NO_PREFIX}${s}` : s;
  return isOrderNo(full) ? full : null;
}

export const trackInput = z.object({
  orderNo: z
    .string({ error: "Enter the order number" })
    .max(30)
    .transform((v, ctx) => {
      const n = normalizeOrderNo(v);
      if (!n) {
        ctx.addIssue({
          code: "custom",
          message: v.trim() ? "Check the order number, like SR10234" : "Enter the order number",
        });
        return z.NEVER;
      }
      return n;
    }),
  phone: phoneField,
});
export type TrackInput = z.infer<typeof trackInput>;

/** Tries per IP in 10 minutes, and per order number in an hour. */
export const TRACK_LIMITS = { perIp: 20, perOrder: 8 } as const;

/** One answer for a wrong number and a wrong phone, so neither can be guessed on its own. */
export const TRACK_NOT_FOUND = "We couldn't find an order with this number and mobile number. Please check both.";

// ---------- What the customer sees ----------

export const CUSTOMER_STATUS: Record<OrderStatus, { label: string; text: string }> = {
  pending: { label: "Order placed", text: "We'll call you soon to confirm it." },
  on_hold: { label: "On hold", text: "We need to check something about your order. We'll contact you." },
  confirmed: { label: "Confirmed", text: "We're getting your order ready." },
  packed: { label: "Packed", text: "Your parcel is packed and waiting for the courier." },
  shipped: { label: "On the way", text: "The courier has your parcel." },
  delivered: { label: "Delivered", text: "Your order was delivered. Thank you!" },
  partially_delivered: { label: "Partly delivered", text: "Part of your order was delivered." },
  cancelled: { label: "Cancelled", text: "This order was cancelled." },
  returned: { label: "Returned", text: "This order came back to us." },
};

export const CUSTOMER_PAYMENT: Record<PaymentStatus, string> = {
  unpaid: "Not paid yet",
  advance_pending: "We're checking your advance payment",
  advance_verified: "Advance received",
  paid: "Paid",
  refunded: "Refunded",
};

const FLOW = ["pending", "confirmed", "packed", "shipped", "delivered"] as const;

export type StepState = "done" | "current" | "todo" | "stopped";
export type Step = { key: string; label: string; state: StepState; at: string | null };
export type HistoryEntry = { status: OrderStatus; at: string };

function lastAt(history: HistoryEntry[], status: OrderStatus): string | null {
  let at: string | null = null;
  for (const h of history) if (h.status === status && (!at || h.at > at)) at = h.at;
  return at;
}

/**
 * The progress line: placed → confirmed → packed → on the way → delivered. A cancelled or returned
 * order shows the steps it reached and ends there; "on hold" stands on the step it reached.
 */
export function orderSteps(status: OrderStatus, history: HistoryEntry[]): Step[] {
  const reached = (s: OrderStatus) => s === "pending" || history.some((h) => h.status === s);
  if (status === "cancelled" || status === "returned") {
    const done: Step[] = FLOW.filter(reached).map((s) => ({
      key: s,
      label: CUSTOMER_STATUS[s].label,
      state: "done",
      at: lastAt(history, s),
    }));
    return [
      ...done,
      { key: status, label: CUSTOMER_STATUS[status].label, state: "stopped", at: lastAt(history, status) },
    ];
  }
  let pos: number;
  if (status === "on_hold") {
    pos = 0;
    FLOW.forEach((s, i) => {
      if (reached(s)) pos = i;
    });
  } else {
    pos = FLOW.indexOf(status === "partially_delivered" ? "delivered" : status);
  }
  return FLOW.map((s, i) => {
    const here = i === pos;
    const label =
      here && status === "on_hold" ? "On hold" : here ? CUSTOMER_STATUS[status].label : CUSTOMER_STATUS[s].label;
    const state: StepState = i < pos ? "done" : here ? (s === "delivered" ? "done" : "current") : "todo";
    const at = i < pos ? lastAt(history, s) : here ? (lastAt(history, status) ?? lastAt(history, s)) : null;
    return { key: s, label, state, at };
  });
}

/** Every change, newest first, in the customer's words (no staff names or notes). */
export function customerTimeline(history: HistoryEntry[]): { label: string; at: string }[] {
  return [...history]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .map((h) => ({ label: CUSTOMER_STATUS[h.status].label, at: h.at }));
}

const dhaka = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dhakaDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "22 Nov 2026, 1:26 pm" in Dhaka time. */
export const dhakaDateTime = (iso: string) =>
  dhaka.format(new Date(iso)).replace(/\b(AM|PM)\b/, (m) => m.toLowerCase());
/** "22 Nov 2026" in Dhaka time. */
export const dhakaDate = (iso: string) => dhakaDay.format(new Date(iso));

// ---------- Sign-in return address ----------

/** Where to go after signing in: a path on this site only (no "//evil.com" or "/\\evil.com"). */
export function safeNext(v: string | null | undefined, fallback = "/account"): string {
  if (!v || v.length > 300 || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(v)) return fallback;
  return v;
}
