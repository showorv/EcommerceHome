import { describe, expect, it } from "vitest";
import { can } from "@/modules/auth/rbac";
import {
  bulkMoveInput,
  canMove,
  canPay,
  canRefund,
  checkPartial,
  isFinal,
  moneyIn,
  moveInput,
  ORDER_MOVES,
  PAYMENT_MOVES,
  partialInput,
  paymentAfterMove,
  refundInput,
  returnInput,
  stockCommitted,
} from "@/modules/orders/lifecycle";
import { ORDER_STATUSES, PAYMENT_STATUSES, type OrderStatus } from "@/modules/orders/orders";
import { canCancel, canConfirm, canEdit, canHold, TAB_STATUSES } from "@/modules/orders/staff";

const oid = (n: number) => n.toString(16).padStart(24, "0");

describe("order status moves (FR-OR-01)", () => {
  it("follow the main line: pending → confirmed → packed → shipped → delivered", () => {
    expect(canMove("pending", "confirmed")).toBe(true);
    expect(canMove("confirmed", "packed")).toBe(true);
    expect(canMove("packed", "shipped")).toBe(true);
    expect(canMove("shipped", "delivered")).toBe(true);
  });

  it("never skip a step or go backwards", () => {
    expect(canMove("pending", "shipped")).toBe(false);
    expect(canMove("pending", "delivered")).toBe(false);
    expect(canMove("confirmed", "shipped")).toBe(false);
    expect(canMove("shipped", "packed")).toBe(false);
    expect(canMove("delivered", "shipped")).toBe(false);
    expect(canMove("confirmed", "pending")).toBe(false);
  });

  it("allow the side states only where they make sense", () => {
    expect(canMove("on_hold", "pending")).toBe(true);
    expect(canMove("on_hold", "on_hold")).toBe(false);
    expect(canMove("packed", "cancelled")).toBe(true);
    // Once the courier has it, it can only come back as a return.
    expect(canMove("shipped", "cancelled")).toBe(false);
    expect(canMove("shipped", "returned")).toBe(true);
    expect(canMove("shipped", "partially_delivered")).toBe(true);
    expect(canMove("delivered", "returned")).toBe(true);
    expect(canMove("delivered", "cancelled")).toBe(false);
  });

  it("end in cancelled, returned or partly delivered", () => {
    expect(ORDER_STATUSES.filter(isFinal)).toEqual(["partially_delivered", "cancelled", "returned"]);
  });

  it("cover every status, and every status can be reached from pending", () => {
    expect(Object.keys(ORDER_MOVES).sort()).toEqual([...ORDER_STATUSES].sort());
    const seen = new Set<OrderStatus>(["pending"]);
    const todo: OrderStatus[] = ["pending"];
    while (todo.length) for (const n of ORDER_MOVES[todo.pop()!]) if (!seen.has(n) && seen.add(n)) todo.push(n);
    expect([...seen].sort()).toEqual([...ORDER_STATUSES].sort());
    for (const s of ORDER_STATUSES) expect(canMove(s, s)).toBe(false);
  });

  it("restock on cancel or return only once the items left the shelf", () => {
    expect(stockCommitted("pending")).toBe(false);
    expect(stockCommitted("on_hold")).toBe(false);
    expect(stockCommitted("confirmed")).toBe(true);
    expect(stockCommitted("packed")).toBe(true);
    expect(stockCommitted("delivered")).toBe(true);
    expect(stockCommitted("cancelled")).toBe(false);
  });

  it("drive what staff are offered", () => {
    expect(canConfirm("on_hold")).toBe(true);
    expect(canConfirm("confirmed")).toBe(false);
    expect(canHold("pending")).toBe(true);
    expect(canHold("on_hold")).toBe(false);
    expect(canCancel("confirmed")).toBe(true);
    expect(canCancel("shipped")).toBe(false);
    // Editing stays before confirmation (FR-OR-08).
    expect(canEdit("confirmed")).toBe(false);
  });

  it("put every status in exactly one list tab", () => {
    const listed = Object.values(TAB_STATUSES).flat();
    expect([...listed].sort()).toEqual([...ORDER_STATUSES].sort());
  });
});

describe("payment status (FR-OR-02)", () => {
  it("moves on its own track", () => {
    expect(Object.keys(PAYMENT_MOVES).sort()).toEqual([...PAYMENT_STATUSES].sort());
    expect(canPay("advance_pending", "advance_verified")).toBe(true);
    expect(canPay("advance_verified", "paid")).toBe(true);
    expect(canPay("unpaid", "refunded")).toBe(false);
    expect(canPay("refunded", "paid")).toBe(false);
    expect(canPay("paid", "unpaid")).toBe(false);
  });

  it("becomes paid when the courier collects, and unpaid when the advance never came", () => {
    expect(paymentAfterMove("delivered", { paymentStatus: "unpaid" })).toBe("paid");
    expect(paymentAfterMove("delivered", { paymentStatus: "advance_verified" })).toBe("paid");
    expect(paymentAfterMove("partially_delivered", { paymentStatus: "unpaid" })).toBe("paid");
    expect(paymentAfterMove("shipped", { paymentStatus: "unpaid" })).toBe("unpaid");
    expect(paymentAfterMove("cancelled", { paymentStatus: "advance_pending", reason: "Advance not received" })).toBe(
      "unpaid",
    );
    expect(paymentAfterMove("cancelled", { paymentStatus: "advance_pending", reason: "Fake order" })).toBe(
      "advance_pending",
    );
    expect(paymentAfterMove("cancelled", { paymentStatus: "refunded" })).toBe("refunded");
  });

  it("allows a refund only when the order won't be delivered in full", () => {
    expect(canRefund({ status: "cancelled", paymentStatus: "advance_verified" })).toBe(true);
    expect(canRefund({ status: "returned", paymentStatus: "paid" })).toBe(true);
    expect(canRefund({ status: "partially_delivered", paymentStatus: "paid" })).toBe(true);
    expect(canRefund({ status: "delivered", paymentStatus: "paid" })).toBe(false);
    expect(canRefund({ status: "cancelled", paymentStatus: "unpaid" })).toBe(false);
    expect(canRefund({ status: "returned", paymentStatus: "refunded" })).toBe(false);
  });

  it("counts the money in: the advance (unless it never arrived) and what the courier collected", () => {
    expect(moneyIn({ advance: { amount: 13000, status: "verified" }, codCollected: 145000 })).toBe(158000);
    expect(moneyIn({ advance: { amount: 13000, status: "not_found" }, codCollected: 0 })).toBe(0);
    expect(moneyIn({ advance: null, codCollected: 0 })).toBe(0);
  });

  it("needs managers to mark refunds", () => {
    expect(can({ role: "staff" }, "orders.refund")).toBe(false);
    expect(can({ role: "manager" }, "orders.refund")).toBe(true);
    expect(can({ role: "owner" }, "orders.refund")).toBe(true);
  });
});

describe("partly delivered", () => {
  const items = [
    { variantId: oid(1), qty: 2 },
    { variantId: oid(2), qty: 1 },
  ];

  it("keeps only the lines that came back", () => {
    expect(
      checkPartial(items, [
        { variantId: oid(1), qty: 1 },
        { variantId: oid(2), qty: 0 },
      ]),
    ).toEqual({ ok: true, lines: [{ variantId: oid(1), qty: 1 }] });
  });

  it("refuses nothing back, everything back, too many back and unknown lines", () => {
    expect(checkPartial(items, [{ variantId: oid(1), qty: 0 }]).ok).toBe(false);
    expect(
      checkPartial(items, [
        { variantId: oid(1), qty: 2 },
        { variantId: oid(2), qty: 1 },
      ]),
    ).toEqual({ ok: false, error: "Every unit came back: mark the order Returned instead." });
    expect(checkPartial(items, [{ variantId: oid(2), qty: 2 }]).ok).toBe(false);
    expect(checkPartial(items, [{ variantId: oid(9), qty: 1 }]).ok).toBe(false);
    expect(
      checkPartial(items, [
        { variantId: oid(1), qty: 1 },
        { variantId: oid(1), qty: 1 },
      ]).ok,
    ).toBe(false);
  });
});

describe("inputs", () => {
  const base = { orderNo: "SR10001", rev: 3 };

  it("offer only the plain moves through the simple form", () => {
    expect(moveInput.safeParse({ ...base, to: "packed" }).success).toBe(true);
    expect(moveInput.safeParse({ ...base, to: "confirmed" }).success).toBe(false);
    expect(moveInput.safeParse({ ...base, to: "cancelled" }).success).toBe(false);
    expect(bulkMoveInput.safeParse({ orderNos: ["SR10001"], to: "returned" }).success).toBe(false);
    expect(bulkMoveInput.safeParse({ orderNos: ["SR10001"], to: "shipped" }).success).toBe(true);
  });

  it("need a reason to return, and words for 'Other'", () => {
    expect(returnInput.safeParse({ ...base, reason: "Refused at the door" }).success).toBe(true);
    expect(returnInput.safeParse({ ...base, reason: "Other" }).success).toBe(false);
    expect(returnInput.safeParse({ ...base, reason: "Other", note: "Box crushed" }).success).toBe(true);
  });

  it("take taka and store poisha", () => {
    const p = partialInput.parse({ ...base, returned: [{ variantId: oid(1), qty: "1" }], collected: "1450.5" });
    expect(p).toMatchObject({ collected: 145050, returned: [{ qty: 1 }] });
    expect(refundInput.parse({ ...base, amount: "130", note: "bKash" }).amount).toBe(13000);
    expect(refundInput.safeParse({ ...base, amount: "0", note: "bKash" }).success).toBe(false);
    expect(refundInput.safeParse({ ...base, amount: "130", note: "" }).success).toBe(false);
  });
});
