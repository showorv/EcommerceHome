import { z } from "zod";
import { normalizeBdPhone } from "@/lib/phone";
import { codFee } from "@/modules/delivery/charge";
import type { PaymentMethod } from "@/modules/checkout/checkout";
import type { WalletType } from "@/modules/payments/payments";
import type { RiskLevel } from "./risk";
import { canMove } from "./lifecycle";
import type { OrderItem, OrderStatus, PaymentStatus } from "./orders";

/**
 * What staff do with an order (SRS §2.4, FR-OR-08/09, FR-AD-05): call, note, edit, then confirm or
 * cancel. Pure and browser-safe; the database side is manage.ts. Money is poisha. Which status moves
 * are allowed at all is lifecycle.ts.
 */

// ---------- Which actions an order allows ----------

/** Only orders nobody has confirmed yet can be edited (FR-OR-08). */
export const canEdit = (s: OrderStatus) => s === "pending" || s === "on_hold";
export const canConfirm = (s: OrderStatus) => canMove(s, "confirmed");
/** Before it ships: after that it's returned instead. */
export const canCancel = (s: OrderStatus) => canMove(s, "cancelled");
export const canHold = (s: OrderStatus) => canMove(s, "on_hold");

/**
 * An advance must be checked against the wallet statement before the order is confirmed (SRS §2.4).
 * Confirming with the "I checked it" tick marks it checked in the same step.
 */
export const needsAdvanceCheck = (o: { advance: { status: string } | null }) =>
  !!o.advance && o.advance.status === "pending";

// ---------- Call log and notes (FR-OR-09) ----------

export const CALL_OUTCOMES = [
  "confirmed_by_phone",
  "no_answer",
  "call_later",
  "switched_off",
  "wrong_number",
  "refused",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];
export const CALL_OUTCOME_NAMES: Record<CallOutcome, string> = {
  confirmed_by_phone: "Confirmed by phone",
  no_answer: "No answer",
  call_later: "Asked to call later",
  switched_off: "Phone switched off",
  wrong_number: "Wrong number",
  refused: "Refused the order",
};

const id = z.string().regex(/^[a-f0-9]{24}$/i, "Reload the page and try again");
const orderNo = z.string().regex(/^SR\d{5,9}$/, "Reload the page and try again");
const rev = z.number().int().min(0);
const noteText = (max: number) =>
  z.string({ error: "Write a note" }).trim().min(1, "Write a note").max(max, `Keep it under ${max} characters`);

export const callInput = z.object({
  orderNo,
  outcome: z.enum(CALL_OUTCOMES, { error: "Choose what happened" }),
  note: z.string().trim().max(500, "Keep it under 500 characters").default(""),
});
export const noteInput = z.object({ orderNo, text: noteText(1000) });

export type CallEntry = { outcome: CallOutcome; note: string; at: string; byName: string };
export type NoteEntry = { text: string; at: string; byName: string };

// ---------- Confirm, hold, cancel ----------

export const CANCEL_REASONS = [
  "Customer cancelled",
  "Couldn't reach the customer",
  "Fake order",
  "Duplicate order",
  "Out of stock",
  "Advance not received",
  "Other",
] as const;

export const confirmInput = z.object({
  orderNo,
  rev,
  /** Staff found the TrxID and amount in the wallet statement (needed when the order has an advance). */
  advanceChecked: z.boolean().default(false),
  note: z.string().trim().max(500, "Keep it under 500 characters").default(""),
});
export const holdInput = z.object({ orderNo, rev, note: noteText(500) });
const otherNeedsNote = (v: { reason: string; note: string }) => v.reason !== "Other" || v.note.length > 0;
const OTHER_NOTE = { message: "Write the reason", path: ["note"] };

export const cancelInput = z
  .object({
    orderNo,
    rev,
    reason: z.enum(CANCEL_REASONS, { error: "Choose a reason" }),
    note: z.string().trim().max(500, "Keep it under 500 characters").default(""),
  })
  .refine(otherNeedsNote, OTHER_NOTE);

/** The reason as it appears in the history: "Fake order — gave a made-up address". */
export const cancelNote = (reason: string, note: string) => (note ? `${reason}: ${note}` : reason);

export const bulkInput = z.object({
  orderNos: z.array(orderNo).min(1, "Select at least one order").max(100, "Select at most 100 orders"),
});
export const bulkCancelInput = bulkInput
  .extend({
    reason: z.enum(CANCEL_REASONS, { error: "Choose a reason" }),
    note: z.string().trim().max(500, "Keep it under 500 characters").default(""),
  })
  .refine(otherNeedsNote, OTHER_NOTE);

// ---------- Editing before confirmation (FR-OR-08) ----------

const qty = z.coerce
  .number({ error: "Enter a quantity" })
  .int("Use a whole number")
  .min(1, "At least 1")
  .max(99, "At most 99");
const taka = z.coerce
  .number({ error: "Enter an amount in taka" })
  .min(0, "Must be 0 or more")
  .max(10_000_000, "Too large")
  .transform((t) => Math.round(t * 100));

export const orderEditInput = z.object({
  orderNo,
  rev,
  name: z.string().trim().min(2, "Enter the customer's name").max(80, "Keep the name under 80 characters"),
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
  email: z.union([z.literal(""), z.email("Enter a valid email").max(120)]).default(""),
  districtId: id,
  areaId: id,
  address: z.string().trim().min(8, "Write the full address").max(300, "Keep the address under 300 characters"),
  note: z.string().trim().max(300, "Keep the note under 300 characters").default(""),
  items: z
    .array(z.object({ variantId: id, qty }))
    .min(1, "An order needs at least one item. Cancel it instead.")
    .max(50, "At most 50 items")
    .refine((a) => new Set(a.map((i) => i.variantId)).size === a.length, "An item is listed twice"),
  discount: taka,
  deliveryCharge: taka,
  /** Why it changed, for the record. */
  reason: z.string().trim().max(300, "Keep it under 300 characters").default(""),
});
export type OrderEditInput = z.output<typeof orderEditInput>;

export type EditTotals = {
  subtotal: number;
  discount: number;
  deliveryCharge: number;
  codFee: number;
  total: number;
  /** Already sent by bKash/Nagad: it doesn't change when the order does. */
  advancePaid: number;
  codAmount: number;
  /** The advance is more than the new goods + delivery: the difference is owed back. */
  overpaid: number;
};

/**
 * Totals after staff change an order. Like checkout: the COD fee is a share of what the courier
 * collects, and an advance already sent stays as it is, so the door amount takes the difference.
 */
export function editedTotals(input: {
  items: Pick<OrderItem, "price" | "qty">[];
  discount: number;
  deliveryCharge: number;
  codFeePercent: number;
  advancePaid: number;
}): EditTotals {
  const subtotal = input.items.reduce((n, i) => n + i.price * i.qty, 0);
  const discount = Math.min(subtotal, Math.max(0, input.discount));
  const due = subtotal - discount + Math.max(0, input.deliveryCharge);
  const atDoor = Math.max(0, due - input.advancePaid);
  const fee = codFee(atDoor, input.codFeePercent);
  return {
    subtotal,
    discount,
    deliveryCharge: Math.max(0, input.deliveryCharge),
    codFee: fee,
    total: due + fee,
    advancePaid: input.advancePaid,
    codAmount: atDoor + fee,
    overpaid: Math.max(0, input.advancePaid - due),
  };
}

type Editable = {
  customer: { name: string; phone: string; email: string };
  address: { district: string; area: string; line: string; note: string };
  items: Pick<OrderItem, "variantId" | "title" | "variantTitle" | "qty" | "price">[];
  discount: number;
  deliveryCharge: number;
  total: number;
};

const money = (p: number) => `৳${(p / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const itemName = (i: Pick<OrderItem, "title" | "variantTitle">) =>
  i.variantTitle ? `${i.title} (${i.variantTitle})` : i.title;

/** What changed, in words, for the order's record (FR-OR-08: every change recorded). */
export function describeEdit(before: Editable, after: Editable): string[] {
  const out: string[] = [];
  const field = (label: string, a: string, b: string) => {
    if (a !== b) out.push(`${label}: "${a || "—"}" → "${b || "—"}"`);
  };
  field("Name", before.customer.name, after.customer.name);
  field("Phone", before.customer.phone.replace(/^\+88/, ""), after.customer.phone.replace(/^\+88/, ""));
  field("Email", before.customer.email, after.customer.email);
  const place = (a: Editable["address"]) => `${a.area}, ${a.district}`;
  field("Area", place(before.address), place(after.address));
  field("Address", before.address.line, after.address.line);
  field("Delivery note", before.address.note, after.address.note);

  const was = new Map(before.items.map((i) => [i.variantId, i]));
  const now = new Map(after.items.map((i) => [i.variantId, i]));
  for (const [v, i] of now) {
    const old = was.get(v);
    if (!old) out.push(`Added ${i.qty} × ${itemName(i)} at ${money(i.price)}`);
    else if (old.qty !== i.qty) out.push(`${itemName(i)}: ${old.qty} → ${i.qty}`);
  }
  for (const [v, i] of was) if (!now.has(v)) out.push(`Removed ${i.qty} × ${itemName(i)}`);

  if (before.discount !== after.discount) out.push(`Discount: ${money(before.discount)} → ${money(after.discount)}`);
  if (before.deliveryCharge !== after.deliveryCharge) {
    out.push(`Delivery charge: ${money(before.deliveryCharge)} → ${money(after.deliveryCharge)}`);
  }
  if (out.length > 0 && before.total !== after.total) out.push(`Total: ${money(before.total)} → ${money(after.total)}`);
  return out;
}

// ---------- What the admin pages read ----------

export type EditEntry = { at: string; byName: string; changes: string[]; reason: string };

export type AdminOrder = {
  id: string;
  orderNo: string;
  rev: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  customer: { name: string; phone: string; email: string };
  address: { districtId: string; district: string; areaId: string; area: string; line: string; note: string };
  zoneId: string;
  zoneName: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  couponCode: string | null;
  deliveryCharge: number;
  codFee: number;
  total: number;
  codAmount: number;
  paymentMethod: PaymentMethod;
  advance: {
    method: WalletType;
    senderNumber: string;
    trxId: string;
    amount: number;
    /** not_found: staff looked for it and it never arrived. */
    status: "pending" | "verified" | "not_found";
    verifiedByName: string;
    verifiedAt: string | null;
  } | null;
  /** What the courier collected at the door (delivered or partly delivered). */
  codCollected: number;
  /** Partly delivered: the units that came back. */
  returnedItems: { variantId: string; qty: number }[];
  returnReason: string;
  refund: { amount: number; note: string; at: string; byName: string } | null;
  paymentHistory: { status: PaymentStatus; at: string; byName: string; note: string }[];
  reservation: { active: boolean; until: string; releasedAt: string | null };
  risk: { score: number; level: RiskLevel; reasons: string[] };
  statusHistory: { status: OrderStatus; at: string; byName: string; note: string }[];
  callLog: CallEntry[];
  notes: NoteEntry[];
  edits: EditEntry[];
  cancelReason: string;
  ip: string | null;
};

/** One row of the orders list. */
export type OrderRow = {
  id: string;
  orderNo: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  name: string;
  phone: string;
  area: string;
  zoneName: string;
  itemCount: number;
  total: number;
  paymentMethod: PaymentMethod;
  advanceToCheck: boolean;
  riskLevel: RiskLevel;
  riskScore: number;
  lastCall: { outcome: CallOutcome; at: string } | null;
  holdActive: boolean;
};

// ---------- List filters (FR-AD-05) ----------

export const ORDER_TABS = [
  "pending",
  "on_hold",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "returned",
  "cancelled",
  "all",
] as const;
export type OrderTab = (typeof ORDER_TABS)[number];
export const ORDER_TAB_NAMES: Record<OrderTab, string> = {
  pending: "To call",
  on_hold: "On hold",
  confirmed: "To pack",
  packed: "To ship",
  shipped: "On the way",
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
  all: "All",
};
/** The statuses each tab lists (partly delivered orders sit with the delivered ones). */
export const TAB_STATUSES: Record<Exclude<OrderTab, "all">, readonly OrderStatus[]> = {
  pending: ["pending"],
  on_hold: ["on_hold"],
  confirmed: ["confirmed"],
  packed: ["packed"],
  shipped: ["shipped"],
  delivered: ["delivered", "partially_delivered"],
  returned: ["returned"],
  cancelled: ["cancelled"],
};
/** The bulk moves offered on each tab (FR-AD-05). Confirm and cancel come with their own checks. */
export const TAB_BULK: Partial<
  Record<OrderTab, readonly ("confirm" | "cancel" | "packed" | "shipped" | "delivered")[]>
> = {
  pending: ["confirm", "cancel"],
  on_hold: ["confirm", "cancel"],
  confirmed: ["packed", "cancel"],
  packed: ["shipped", "cancel"],
  shipped: ["delivered"],
};

export type OrderFilters = {
  tab: OrderTab;
  q: string;
  zoneId: string;
  payment: PaymentStatus | "";
  /** Dhaka dates, YYYY-MM-DD. */
  from: string;
  to: string;
  page: number;
};

const ymd = /^\d{4}-\d{2}-\d{2}$/;

/** URL search params → filters. Anything unexpected is dropped, never passed to the database. */
export function readOrderFilters(sp: Record<string, string | string[] | undefined>, payments: readonly string[]) {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const tab = (ORDER_TABS as readonly string[]).includes(one("tab")) ? (one("tab") as OrderTab) : "pending";
  return {
    tab,
    q: one("q").trim().slice(0, 60),
    zoneId: /^[a-f0-9]{24}$/i.test(one("zone")) ? one("zone") : "",
    payment: payments.includes(one("payment")) ? (one("payment") as PaymentStatus) : "",
    from: ymd.test(one("from")) ? one("from") : "",
    to: ymd.test(one("to")) ? one("to") : "",
    page: Math.min(1000, Math.max(1, Number(one("page")) || 1)),
  } satisfies OrderFilters;
}

/** Filters → URL query (without page unless asked). */
export function orderFiltersQuery(f: Partial<OrderFilters>, page?: number): string {
  const u = new URLSearchParams();
  if (f.tab && f.tab !== "pending") u.set("tab", f.tab);
  if (f.q) u.set("q", f.q);
  if (f.zoneId) u.set("zone", f.zoneId);
  if (f.payment) u.set("payment", f.payment);
  if (f.from) u.set("from", f.from);
  if (f.to) u.set("to", f.to);
  if (page && page > 1) u.set("page", String(page));
  return u.size ? `?${u}` : "";
}

/** A Dhaka calendar day (UTC+6, no daylight saving) as a UTC range. */
export function dhakaDayStart(ymdText: string): Date {
  return new Date(`${ymdText}T00:00:00+06:00`);
}

// ---------- Export (FR-AD-05) ----------

const csvCell = (v: string | number) => {
  const s = String(v);
  // Quote when needed, and stop spreadsheet formulas (=, +, -, @) from running.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const ORDER_CSV_HEADER = [
  "Order",
  "Date",
  "Status",
  "Payment",
  "Name",
  "Phone",
  "District",
  "Area",
  "Address",
  "Items",
  "Subtotal",
  "Discount",
  "Delivery",
  "COD fee",
  "Total",
  "Advance",
  "TrxID",
  "COD amount",
  "Collected",
  "Refunded",
  "Risk",
];

export function orderCsvLine(o: AdminOrder, statusName: string, paymentName: string): string {
  const t = (p: number) => (p / 100).toFixed(2);
  return [
    o.orderNo,
    o.createdAt,
    statusName,
    paymentName,
    o.customer.name,
    o.customer.phone.replace(/^\+88/, ""),
    o.address.district,
    o.address.area,
    o.address.line,
    o.items.map((i) => `${i.qty} x ${i.sku}`).join("; "),
    t(o.subtotal),
    t(o.discount),
    t(o.deliveryCharge),
    t(o.codFee),
    t(o.total),
    t(o.advance?.amount ?? 0),
    o.advance?.trxId ?? "",
    t(o.codAmount),
    t(o.codCollected),
    t(o.refund?.amount ?? 0),
    o.risk.score,
  ]
    .map(csvCell)
    .join(",");
}
