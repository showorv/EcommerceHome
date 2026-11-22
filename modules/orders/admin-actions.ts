"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { env } from "@/lib/env";
import { trustFilter } from "@/lib/db/trusted-filter";
import { logger } from "@/lib/logger";
import { enqueueInvoicePdf, enqueueNotification } from "@/lib/queue";
import { invoiceUrl } from "@/modules/invoices/invoices";
import { writeAudit } from "@/modules/audit/audit";
import type { Permission } from "@/modules/auth/rbac";
import { checkStaff, requestMeta } from "@/modules/auth/session";
import { productTags, refreshTags, scopeOfProducts } from "@/modules/catalog/store-refresh";
import { searchVariants, type VariantOption } from "./admin-data";
import { bulkMoveInput, moveInput, partialInput, refundInput, returnInput } from "./lifecycle";
import {
  addCall,
  addNote,
  cancelOrder,
  confirmOrder,
  editOrder,
  holdOrder,
  moveOrder,
  OrderActionError,
  partlyDeliverOrder,
  refundOrder,
  returnOrder,
  type ActionDone,
  type Actor,
} from "./manage";
import { Order } from "./models";
import {
  bulkCancelInput,
  bulkInput,
  callInput,
  cancelInput,
  confirmInput,
  holdInput,
  needsAdvanceCheck,
  noteInput,
  orderConfirmedSms,
  orderEditInput,
  type AdminOrder,
} from "./staff";

/**
 * Admin → Orders (SRS §2.4 and §3, FR-OR-01/02/08/09, FR-AD-05): permission → zod → change → audit →
 * refresh. Which moves are allowed is checked again in manage.ts, whatever the page offered.
 */

export type OrderActionResult = { ok: true; message: string } | { ok: false; error: string };
export type BulkResult =
  | { ok: true; message: string; done: string[]; skipped: { orderNo: string; why: string }[] }
  | { ok: false; error: string };

type Staff = { actor: Actor; email: string; meta: Awaited<ReturnType<typeof requestMeta>> };

async function staff(permission: Permission): Promise<Staff | { error: string }> {
  const g = await checkStaff(permission);
  if (!g.ok) return { error: g.status === 401 ? "Please sign in again." : "You do not have permission." };
  const { user } = g.ctx;
  return { actor: { id: user.id, name: user.name || user.email }, email: user.email, meta: await requestMeta() };
}

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the fields.";

/** The parts of an order the audit log keeps (the full order is in the database). */
const auditView = (o: AdminOrder) => ({
  orderNo: o.orderNo,
  status: o.status,
  paymentStatus: o.paymentStatus,
  customer: o.customer,
  address: o.address,
  items: o.items.map((i) => ({ variantId: i.variantId, sku: i.sku, qty: i.qty, price: i.price })),
  subtotal: o.subtotal,
  discount: o.discount,
  deliveryCharge: o.deliveryCharge,
  codFee: o.codFee,
  total: o.total,
  codAmount: o.codAmount,
  advance: o.advance ? { trxId: o.advance.trxId, amount: o.advance.amount, status: o.advance.status } : null,
  codCollected: o.codCollected,
  returnedItems: o.returnedItems,
  refund: o.refund ? { amount: o.refund.amount, note: o.refund.note } : null,
});

async function audit(s: Staff, action: string, done: Pick<ActionDone, "before" | "after">, extra?: object) {
  await writeAudit({
    actor: { id: s.actor.id, email: s.email },
    action,
    entity: "order",
    entityId: done.after.id,
    before: auditView(done.before),
    after: { ...auditView(done.after), ...extra },
    ...s.meta,
  });
}

/** Stock went back on sale: product pages showing "Only N left" or "Sold out" are rebuilt. */
async function refreshProducts(productIds: string[]) {
  if (productIds.length > 0) refreshTags(await productTags(await scopeOfProducts(productIds)));
}

/** After a confirmation: the PDF is printed in the background and the SMS carries the invoice link. */
async function afterConfirm(o: AdminOrder, invoice: { id: string; token: string }) {
  try {
    await enqueueInvoicePdf(invoice.id);
  } catch (err) {
    // Not fatal: the PDF is printed when the link is first opened.
    logger.error({ err, orderNo: o.orderNo }, "invoice PDF job could not be queued");
  }
  try {
    await enqueueNotification({
      kind: "sms",
      to: o.customer.phone,
      text: orderConfirmedSms(o, env().STORE_NAME, invoiceUrl(env().APP_URL, invoice.token)),
      purpose: "order_confirmed",
    });
  } catch (err) {
    logger.error({ err, orderNo: o.orderNo }, "order confirmed SMS could not be queued");
  }
}

async function run(work: () => Promise<string>): Promise<OrderActionResult> {
  try {
    const message = await work();
    refresh();
    return { ok: true, message };
  } catch (err) {
    if (err instanceof OrderActionError) return { ok: false, error: err.message };
    logger.error({ err }, "order action failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

// ---------- One order ----------

export async function confirmOrderAction(raw: unknown): Promise<OrderActionResult> {
  const s = await staff("orders.confirm");
  if ("error" in s) return { ok: false, error: s.error };
  const p = confirmInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  return run(async () => {
    const done = await confirmOrder(p.data, s.actor);
    await audit(s, "order.confirm", done, { invoiceNo: done.invoice.invoiceNo });
    await afterConfirm(done.after, done.invoice);
    return `${done.after.orderNo} confirmed: invoice ${done.invoice.invoiceNo}. The customer gets an SMS with the link.`;
  });
}

export async function holdOrderAction(raw: unknown): Promise<OrderActionResult> {
  const s = await staff("orders.update");
  if ("error" in s) return { ok: false, error: s.error };
  const p = holdInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  return run(async () => {
    const done = await holdOrder(p.data, s.actor);
    await audit(s, "order.hold", done, { note: p.data.note });
    return `${done.after.orderNo} is on hold.`;
  });
}

export async function cancelOrderAction(raw: unknown): Promise<OrderActionResult> {
  const s = await staff("orders.cancel");
  if ("error" in s) return { ok: false, error: s.error };
  const p = cancelInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  return run(async () => {
    const done = await cancelOrder(p.data, s.actor);
    await audit(s, "order.cancel", done, { reason: done.after.cancelReason });
    await refreshProducts(done.productIds);
    return `${done.after.orderNo} cancelled.`;
  });
}

const MOVED: Record<"pending" | "packed" | "shipped" | "delivered", string> = {
  pending: "is back in To call",
  packed: "is packed",
  shipped: "is on the way",
  delivered: "is delivered and paid",
};

/** Back to To call, packed, shipped, delivered. */
export async function moveOrderAction(raw: unknown): Promise<OrderActionResult> {
  const s = await staff("orders.update");
  if ("error" in s) return { ok: false, error: s.error };
  const p = moveInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  return run(async () => {
    const done = await moveOrder(p.data, s.actor);
    await audit(s, `order.${p.data.to}`, done, p.data.note ? { note: p.data.note } : undefined);
    return `${done.after.orderNo} ${MOVED[p.data.to]}.`;
  });
}

export async function returnOrderAction(raw: unknown): Promise<OrderActionResult> {
  const s = await staff("orders.update");
  if ("error" in s) return { ok: false, error: s.error };
  const p = returnInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  return run(async () => {
    const done = await returnOrder(p.data, s.actor);
    await audit(s, "order.returned", done, { reason: done.after.returnReason });
    await refreshProducts(done.productIds);
    return `${done.after.orderNo} returned. The items are back in stock.`;
  });
}

export async function partlyDeliverOrderAction(raw: unknown): Promise<OrderActionResult> {
  const s = await staff("orders.update");
  if ("error" in s) return { ok: false, error: s.error };
  const p = partialInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  return run(async () => {
    const done = await partlyDeliverOrder(p.data, s.actor);
    await audit(s, "order.partially_delivered", done);
    await refreshProducts(done.productIds);
    return `${done.after.orderNo} partly delivered. The units that came back are in stock.`;
  });
}

export async function refundOrderAction(raw: unknown): Promise<OrderActionResult> {
  const s = await staff("orders.refund");
  if ("error" in s) return { ok: false, error: s.error };
  const p = refundInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  return run(async () => {
    const done = await refundOrder(p.data, s.actor);
    await audit(s, "order.refund", done);
    return `${done.after.orderNo} marked refunded.`;
  });
}

export async function addCallAction(raw: unknown): Promise<OrderActionResult> {
  const s = await staff("orders.update");
  if ("error" in s) return { ok: false, error: s.error };
  const p = callInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  return run(async () => {
    await addCall(p.data, s.actor);
    const o = await Order.findOne({ orderNo: p.data.orderNo }).select("_id").lean<{ _id: unknown }>();
    await writeAudit({
      actor: { id: s.actor.id, email: s.email },
      action: "order.call",
      entity: "order",
      entityId: String(o?._id ?? p.data.orderNo),
      after: { orderNo: p.data.orderNo, outcome: p.data.outcome, note: p.data.note },
      ...s.meta,
    });
    return "Call saved.";
  });
}

export async function addNoteAction(raw: unknown): Promise<OrderActionResult> {
  const s = await staff("orders.update");
  if ("error" in s) return { ok: false, error: s.error };
  const p = noteInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  return run(async () => {
    await addNote(p.data, s.actor);
    const o = await Order.findOne({ orderNo: p.data.orderNo }).select("_id").lean<{ _id: unknown }>();
    await writeAudit({
      actor: { id: s.actor.id, email: s.email },
      action: "order.note",
      entity: "order",
      entityId: String(o?._id ?? p.data.orderNo),
      after: { orderNo: p.data.orderNo, text: p.data.text },
      ...s.meta,
    });
    return "Note saved.";
  });
}

export async function editOrderAction(raw: unknown): Promise<OrderActionResult> {
  const s = await staff("orders.update");
  if ("error" in s) return { ok: false, error: s.error };
  const p = orderEditInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  return run(async () => {
    const done = await editOrder(p.data, s.actor);
    if (!("after" in done)) return "Nothing changed.";
    await audit(s, "order.edit", done, { changes: done.changes, reason: p.data.reason });
    await refreshProducts(done.productIds);
    return `${done.after.orderNo} saved.`;
  });
}

const searchInput = z.string().trim().min(2).max(60);

export async function searchVariantsAction(q: unknown): Promise<VariantOption[]> {
  const s = await staff("orders.update");
  if ("error" in s) return [];
  const p = searchInput.safeParse(q);
  return p.success ? searchVariants(p.data) : [];
}

// ---------- Several orders (FR-AD-05) ----------

/**
 * Each order is handled on its own: one that can't be confirmed (an advance to check, not enough
 * stock, already changed) is listed with the reason and the rest go ahead.
 */
async function eachOrder(
  orderNos: string[],
  work: (o: { orderNo: string; rev: number; advance: { status: string } | null }) => Promise<void>,
): Promise<{ done: string[]; skipped: { orderNo: string; why: string }[] }> {
  const docs = await Order.find(trustFilter({ orderNo: { $in: orderNos } }))
    .select("orderNo rev advance.status")
    .lean<{ orderNo: string; rev?: number; advance?: { status: string } | null }[]>();
  const byNo = new Map(docs.map((d) => [d.orderNo, d]));
  const done: string[] = [];
  const skipped: { orderNo: string; why: string }[] = [];
  for (const orderNo of orderNos) {
    const d = byNo.get(orderNo);
    if (!d) {
      skipped.push({ orderNo, why: "No longer exists" });
      continue;
    }
    try {
      await work({ orderNo, rev: Number(d.rev ?? 0), advance: d.advance ?? null });
      done.push(orderNo);
    } catch (err) {
      if (err instanceof OrderActionError) skipped.push({ orderNo, why: err.message });
      else {
        logger.error({ err, orderNo }, "bulk order action failed");
        skipped.push({ orderNo, why: "Something went wrong" });
      }
    }
  }
  return { done, skipped };
}

/** A failure outside any one order (e.g. the database is down) skips them all instead of breaking the page. */
const safely =
  (fn: typeof eachOrder): typeof eachOrder =>
  async (orderNos, work) => {
    try {
      return await fn(orderNos, work);
    } catch (err) {
      logger.error({ err }, "bulk order action failed");
      return { done: [], skipped: orderNos.map((orderNo) => ({ orderNo, why: "Something went wrong" })) };
    }
  };

const summary = (verb: string, done: number, skipped: number) =>
  `${done} order${done === 1 ? "" : "s"} ${verb}.${skipped ? ` ${skipped} skipped.` : ""}`;

export async function bulkConfirmAction(raw: unknown): Promise<BulkResult> {
  const s = await staff("orders.confirm");
  if ("error" in s) return { ok: false, error: s.error };
  const p = bulkInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  const r = await safely(eachOrder)(p.data.orderNos, async (o) => {
    // Bulk never ticks "advance checked" for staff: those orders are confirmed one by one.
    if (needsAdvanceCheck(o)) throw new OrderActionError("Has an advance to check: open it to confirm");
    const done = await confirmOrder({ orderNo: o.orderNo, rev: o.rev, advanceChecked: false, note: "" }, s.actor);
    await audit(s, "order.confirm", done, { bulk: true, invoiceNo: done.invoice.invoiceNo });
    await afterConfirm(done.after, done.invoice);
  });
  refresh();
  return { ok: true, message: summary("confirmed", r.done.length, r.skipped.length), ...r };
}

export async function bulkCancelAction(raw: unknown): Promise<BulkResult> {
  const s = await staff("orders.cancel");
  if ("error" in s) return { ok: false, error: s.error };
  const p = bulkCancelInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  const productIds = new Set<string>();
  const r = await safely(eachOrder)(p.data.orderNos, async (o) => {
    const done = await cancelOrder(
      { orderNo: o.orderNo, rev: o.rev, reason: p.data.reason, note: p.data.note },
      s.actor,
    );
    await audit(s, "order.cancel", done, { reason: done.after.cancelReason, bulk: true });
    done.productIds.forEach((id) => productIds.add(id));
  });
  await refreshProducts([...productIds]);
  refresh();
  return { ok: true, message: summary("cancelled", r.done.length, r.skipped.length), ...r };
}

const BULK_MOVED: Record<"packed" | "shipped" | "delivered", string> = {
  packed: "marked packed",
  shipped: "marked shipped",
  delivered: "marked delivered",
};

/** Packed, shipped or delivered for several orders at once (FR-AD-05). */
export async function bulkMoveAction(raw: unknown): Promise<BulkResult> {
  const s = await staff("orders.update");
  if ("error" in s) return { ok: false, error: s.error };
  const p = bulkMoveInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  const { to } = p.data;
  const r = await safely(eachOrder)(p.data.orderNos, async (o) => {
    const done = await moveOrder({ orderNo: o.orderNo, rev: o.rev, to, note: "" }, s.actor);
    await audit(s, `order.${to}`, done, { bulk: true });
  });
  refresh();
  return { ok: true, message: summary(BULK_MOVED[to], r.done.length, r.skipped.length), ...r };
}
