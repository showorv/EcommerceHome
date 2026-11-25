import { z } from "zod";
import type { OrderItem, OrderStatus, PaymentStatus } from "./orders";

/**
 * The order lifecycle (SRS §3, FR-OR-01/02). Pure and browser-safe: which status an order may move
 * to next, which payment status, and what each move does to the stock. The server (manage.ts) refuses
 * any other move; the admin pages only offer these.
 *
 *   pending ⇄ on_hold → confirmed → packed → shipped → delivered → returned (customer return)
 *        ↘ cancelled ↙         ↘ cancelled ↙         ↘ partially delivered
 *                                                     ↘ returned (RTO)
 */

// ---------- Order status (FR-OR-01) ----------

export const ORDER_MOVES: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["on_hold", "confirmed", "cancelled"],
  on_hold: ["pending", "confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered", "partially_delivered", "returned"],
  delivered: ["returned"],
  partially_delivered: [],
  cancelled: [],
  returned: [],
};

export const canMove = (from: OrderStatus, to: OrderStatus): boolean => ORDER_MOVES[from]?.includes(to) ?? false;

/** No move leads out of it. */
export const isFinal = (s: OrderStatus): boolean => (ORDER_MOVES[s]?.length ?? 0) === 0;

/** The items have left the shelf for good (confirmed and after), so cancelling or a return restocks them. */
export const stockCommitted = (s: OrderStatus): boolean =>
  s === "confirmed" || s === "packed" || s === "shipped" || s === "delivered";

/** The words on the button that makes each move. */
export const MOVE_NAMES: Record<OrderStatus, string> = {
  pending: "Back to To call",
  on_hold: "Put on hold",
  confirmed: "Confirm",
  packed: "Mark packed",
  shipped: "Mark shipped",
  delivered: "Mark delivered",
  partially_delivered: "Partly delivered",
  cancelled: "Cancel order",
  returned: "Mark returned",
};

/** What happens to the money when the order moves (FR-OR-02). */
export function paymentAfterMove(to: OrderStatus, o: { paymentStatus: PaymentStatus; reason?: string }): PaymentStatus {
  // The courier collected the cash: the order is paid (an advance already checked included).
  if ((to === "delivered" || to === "partially_delivered") && canPay(o.paymentStatus, "paid")) return "paid";
  // Cancelled because the advance never arrived: there's nothing to check or refund.
  if (to === "cancelled" && o.paymentStatus === "advance_pending" && o.reason === "Advance not received") {
    return "unpaid";
  }
  return o.paymentStatus;
}

// ---------- Payment status (FR-OR-02), apart from the order status ----------

export const PAYMENT_MOVES: Record<PaymentStatus, readonly PaymentStatus[]> = {
  unpaid: ["paid"],
  advance_pending: ["advance_verified", "unpaid", "refunded"],
  advance_verified: ["paid", "refunded"],
  paid: ["refunded"],
  refunded: [],
};

export const canPay = (from: PaymentStatus, to: PaymentStatus): boolean => PAYMENT_MOVES[from]?.includes(to) ?? false;

/** Money can go back only once the order won't be delivered in full (cancelled, returned, partly delivered). */
export const canRefund = (o: { status: OrderStatus; paymentStatus: PaymentStatus }): boolean =>
  (o.status === "cancelled" || o.status === "returned" || o.status === "partially_delivered") &&
  canPay(o.paymentStatus, "refunded");

/** What the shop has received for the order so far: the advance (if sent) and what the courier collected. */
export function moneyIn(o: { advance: { amount: number; status: string } | null; codCollected: number }): number {
  const advance = o.advance && o.advance.status !== "not_found" ? o.advance.amount : 0;
  return advance + o.codCollected;
}

// ---------- Inputs ----------

const orderNo = z.string().regex(/^SR\d{5,9}$/, "Reload the page and try again");
const rev = z.number().int().min(0);
const note = z.string().trim().max(500, "Keep it under 500 characters").default("");
const taka = z.coerce
  .number({ error: "Enter an amount in taka" })
  .min(0, "Must be 0 or more")
  .max(10_000_000, "Too large")
  .transform((t) => Math.round(t * 100));

/** The plain moves: no stock or money questions to answer. */
export const SIMPLE_MOVES = ["pending", "packed", "shipped", "delivered"] as const;
export type SimpleMove = (typeof SIMPLE_MOVES)[number];

export const moveInput = z.object({ orderNo, rev, to: z.enum(SIMPLE_MOVES), note });

export const RETURN_REASONS = [
  "Refused at the door",
  "Couldn't reach the customer",
  "Wrong or incomplete address",
  "Customer returned it after delivery",
  "Damaged in delivery",
  "Other",
] as const;

export const returnInput = z
  .object({ orderNo, rev, reason: z.enum(RETURN_REASONS, { error: "Choose a reason" }), note })
  .refine((v) => v.reason !== "Other" || v.note.length > 0, { message: "Write the reason", path: ["note"] });

export const partialInput = z.object({
  orderNo,
  rev,
  /** Units that came back, per line. */
  returned: z
    .array(
      z.object({
        variantId: z.string().regex(/^[a-f0-9]{24}$/i, "Reload the page and try again"),
        qty: z.coerce.number().int("Use a whole number").min(0, "Must be 0 or more").max(99),
      }),
    )
    .max(50),
  /** What the courier collected at the door, in taka. */
  collected: taka,
  note,
});
export type PartialInput = z.output<typeof partialInput>;

export const refundInput = z.object({
  orderNo,
  rev,
  amount: taka.refine((p) => p > 0, "Enter the amount sent back"),
  /** How it went back, e.g. "bKash to 017…, TrxID 9ABC". */
  note: z.string().trim().min(1, "Write how it was sent back").max(500, "Keep it under 500 characters"),
});

export const bulkMoveInput = z.object({
  orderNos: z.array(orderNo).min(1, "Select at least one order").max(100, "Select at most 100 orders"),
  to: z.enum(["packed", "shipped", "delivered"]),
});

/**
 * A partly delivered order: which lines came back, checked against the order. At least one unit must
 * come back and at least one must be kept (otherwise it's "Returned" or "Delivered").
 */
export function checkPartial(
  items: Pick<OrderItem, "variantId" | "qty">[],
  returned: { variantId: string; qty: number }[],
): { ok: true; lines: { variantId: string; qty: number }[] } | { ok: false; error: string } {
  const back = new Map<string, number>();
  for (const r of returned) {
    if (back.has(r.variantId)) return { ok: false, error: "An item is listed twice." };
    back.set(r.variantId, r.qty);
  }
  const lines: { variantId: string; qty: number }[] = [];
  let kept = 0;
  for (const i of items) {
    const q = back.get(i.variantId) ?? 0;
    if (q > i.qty) return { ok: false, error: "More units came back than were sent." };
    if (q > 0) lines.push({ variantId: i.variantId, qty: q });
    kept += i.qty - q;
    back.delete(i.variantId);
  }
  if (back.size > 0) return { ok: false, error: "An item isn't on this order. Reload the page." };
  if (lines.length === 0) return { ok: false, error: "Enter the units that came back." };
  if (kept === 0) return { ok: false, error: "Every unit came back: mark the order Returned instead." };
  return { ok: true, lines };
}
