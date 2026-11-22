import "server-only";
import mongoose from "mongoose";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { variantFacts } from "@/modules/cart/data";
import { syncProductFromVariants } from "@/modules/catalog/listing-sync";
import { InventoryMovement, Variant } from "@/modules/catalog/models";
import { CouponModel } from "@/modules/coupons/models";
import { zoneIdFor } from "@/modules/delivery/charge";
import { getDeliveryConfig } from "@/modules/delivery/data";
import { issueInvoice, loadInvoiceSettings, type Issued } from "@/modules/invoices/data";
import { toAdminOrder } from "./admin-data";
import {
  canMove,
  canRefund,
  checkPartial,
  moneyIn,
  paymentAfterMove,
  stockCommitted,
  type PartialInput,
  type SimpleMove,
} from "./lifecycle";
import { Order } from "./models";
import { ORDER_STATUS_NAMES, type OrderItem, type OrderStatus, type PaymentStatus } from "./orders";
import { giveBack } from "./reservations";
import {
  canEdit,
  cancelNote,
  describeEdit,
  editedTotals,
  needsAdvanceCheck,
  type AdminOrder,
  type CallOutcome,
  type OrderEditInput,
} from "./staff";

/**
 * Staff changes to an order (SRS §2.4 and §3, FR-OR-01/02/08/09). Every status move is checked
 * against lifecycle.ts and runs in one transaction with its stock and payment change. `rev` goes up
 * with every change, so a change made from an older copy of the order (another staff member got
 * there first) is refused instead of overwriting. Callers check permissions and write the audit log.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

export class OrderActionError extends Error {}

export type Actor = { id: string; name: string };

const STALE = "Someone else changed this order a moment ago. Reload the page to see it.";
const itemName = (i: { title: string; variantTitle: string }) =>
  i.variantTitle ? `${i.title} (${i.variantTitle})` : i.title;

async function load(orderNo: string): Promise<AnyDoc> {
  await connectMongoose();
  const d = await Order.findOne({ orderNo }).lean<AnyDoc>();
  if (!d) throw new OrderActionError("This order no longer exists.");
  return d;
}

/** Matches the order only as it was read: same revision and status (orders saved before 2.9 have no rev). */
function asRead(d: AnyDoc) {
  const rev = Number(d.rev ?? 0);
  return trustFilter({
    _id: d._id,
    status: d.status,
    "reservation.active": d.reservation?.active === true,
    ...(rev === 0 ? { $or: [{ rev: 0 }, { rev: { $exists: false } }] } : { rev }),
  });
}

function checkRev(d: AnyDoc, rev: number) {
  if (Number(d.rev ?? 0) !== rev) throw new OrderActionError(STALE);
}

/** The one gate for status changes (FR-OR-01): anything lifecycle.ts doesn't allow is refused. */
function checkMove(d: AnyDoc, to: OrderStatus, rev: number) {
  if (!canMove(d.status, to)) {
    const from = ORDER_STATUS_NAMES[d.status as OrderStatus] ?? d.status;
    throw new OrderActionError(
      `A ${from.toLowerCase()} order can't be moved to ${ORDER_STATUS_NAMES[to].toLowerCase()}.`,
    );
  }
  checkRev(d, rev);
}

const historyEntry = (status: OrderStatus, at: Date, by: Actor, note: string) => ({
  status,
  at,
  by: by.id,
  byName: by.name,
  note,
});

/** The $set and $push parts that move the payment status, when it changes (FR-OR-02). */
function paymentChange(d: AnyDoc, to: PaymentStatus, at: Date, by: Actor, note: string) {
  if (to === d.paymentStatus) return { set: {}, push: {} };
  return {
    set: { paymentStatus: to },
    push: { paymentHistory: { status: to, at, by: by.id, byName: by.name, note } },
  };
}

/**
 * Units come back onto the shelf (cancelled after confirmation, returned, partly delivered): stock
 * goes up and each line gets a movement. A variant deleted since has nothing to go back to.
 */
async function restock(
  d: AnyDoc,
  lines: { variantId: string; qty: number }[],
  reason: "cancel" | "return",
  note: string,
  by: Actor,
  session: mongoose.ClientSession,
) {
  for (const l of lines) {
    if (l.qty <= 0) continue;
    const _id = new mongoose.Types.ObjectId(l.variantId);
    const v = await Variant.findOneAndUpdate(
      { _id },
      { $inc: { stock: l.qty } },
      { session, new: true },
    ).lean<AnyDoc>();
    if (!v) continue;
    await InventoryMovement.create(
      [
        {
          variantId: _id,
          productId: v.productId,
          change: l.qty,
          stockAfter: Number(v.stock),
          reason,
          refId: String(d._id),
          note,
          byUserId: by.id,
        },
      ],
      { session },
    );
  }
}

const allLines = (d: AnyDoc) =>
  ((d.items ?? []) as AnyDoc[]).map((i) => ({ variantId: String(i.variantId), qty: Number(i.qty) }));

async function inTransaction(work: (s: mongoose.ClientSession) => Promise<void>) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}

async function syncProducts(items: AnyDoc[], session: mongoose.ClientSession): Promise<string[]> {
  const ids = [...new Set(items.map((i) => String(i.productId)))];
  for (const p of ids) await syncProductFromVariants(p, session);
  return ids;
}

export type ActionDone = { before: AdminOrder; after: AdminOrder; productIds: string[] };
export type ConfirmDone = ActionDone & { invoice: Issued };

async function reread(orderNo: string): Promise<AdminOrder> {
  const d = await Order.findOne({ orderNo }).lean<AnyDoc>();
  return toAdminOrder(d!);
}

// ---------- Confirm ----------

/**
 * Confirmed: the held units leave the stock for good (an "order" movement each). If the hold already
 * ran out, the units are taken now, only if enough are free. An advance is marked checked, and the
 * invoice is issued in the same transaction (FR-OR-03).
 */
export async function confirmOrder(
  input: { orderNo: string; rev: number; advanceChecked: boolean; note: string },
  by: Actor,
): Promise<ConfirmDone> {
  const d = await load(input.orderNo);
  checkMove(d, "confirmed", input.rev);
  const advanceToCheck = needsAdvanceCheck({ advance: d.advance ?? null });
  if (advanceToCheck && !input.advanceChecked) {
    throw new OrderActionError("Find the TrxID and amount in your wallet statement, then tick the box.");
  }
  const held = d.reservation?.active === true;
  const now = new Date();
  const { settings: invoiceSettings } = await loadInvoiceSettings();
  let productIds: string[] = [];
  let invoice: Issued | null = null;

  await inTransaction(async (session) => {
    invoice = await issueInvoice(d, invoiceSettings, now, session);
    const set: Record<string, unknown> = {
      invoiceId: invoice.id,
      status: "confirmed",
      confirmedAt: now,
      confirmedBy: by.id,
      "reservation.active": false,
      "reservation.committedAt": now,
    };
    const pay = advanceToCheck
      ? paymentChange(d, "advance_verified", now, by, "TrxID and amount found in the statement")
      : { set: {}, push: {} };
    if (advanceToCheck) {
      Object.assign(set, {
        "advance.status": "verified",
        "advance.verifiedBy": by.id,
        "advance.verifiedByName": by.name,
        "advance.verifiedAt": now,
      });
    }
    const res = await Order.updateOne(
      asRead(d),
      {
        $set: { ...set, ...pay.set },
        $inc: { rev: 1 },
        $push: { statusHistory: historyEntry("confirmed", now, by, input.note), ...pay.push },
      },
      { session },
    );
    if (res.modifiedCount !== 1) throw new OrderActionError(STALE);

    for (const i of (d.items ?? []) as AnyDoc[]) {
      const _id = new mongoose.Types.ObjectId(String(i.variantId));
      const qty = Number(i.qty);
      // Held: the units are already set aside, so only the shelf count must cover them.
      // Not held (the hold ran out): they must still be free.
      const enough = held
        ? { stock: { $gte: qty } }
        : { $expr: { $gte: [{ $subtract: ["$stock", { $ifNull: ["$reserved", 0] }] }, qty] } };
      const v = await Variant.findOneAndUpdate(
        trustFilter({ _id, ...enough }),
        { $inc: { stock: -qty } },
        { session, new: true },
      ).lean<AnyDoc>();
      if (!v) {
        const left = await Variant.findById(_id).select("stock reserved").session(session).lean<AnyDoc>();
        const free = left ? Math.max(0, Number(left.stock) - (held ? 0 : Number(left.reserved ?? 0))) : 0;
        throw new OrderActionError(
          `Not enough stock for ${itemName({ title: i.title, variantTitle: i.variantTitle ?? "" })}: ${free} left. Edit the order or cancel it.`,
        );
      }
      if (held) await giveBack(String(i.variantId), qty, session);
      await InventoryMovement.create(
        [
          {
            variantId: _id,
            productId: v.productId,
            change: -qty,
            stockAfter: Number(v.stock),
            reason: "order",
            refId: String(d._id),
            note: `Order ${d.orderNo} confirmed`,
            byUserId: by.id,
          },
        ],
        { session },
      );
    }
    productIds = await syncProducts(d.items ?? [], session);
  });

  return { before: toAdminOrder(d), after: await reread(d.orderNo), productIds, invoice: invoice! };
}

// ---------- Hold, and back to the call queue ----------

/** On hold (e.g. asked to call later): the stock hold keeps running until it ends. */
export async function holdOrder(input: { orderNo: string; rev: number; note: string }, by: Actor): Promise<ActionDone> {
  const d = await load(input.orderNo);
  checkMove(d, "on_hold", input.rev);
  const now = new Date();
  const res = await Order.updateOne(asRead(d), {
    $set: { status: "on_hold" },
    $inc: { rev: 1 },
    $push: { statusHistory: historyEntry("on_hold", now, by, input.note) },
  });
  if (res.modifiedCount !== 1) throw new OrderActionError(STALE);
  return { before: toAdminOrder(d), after: await reread(d.orderNo), productIds: [] };
}

// ---------- Cancel ----------

/**
 * Cancelled. Before confirmation the held stock goes back on sale; after it (confirmed or packed) the
 * units go back onto the shelf with a "cancel" movement. Any coupon use is given back. An advance that
 * never arrived is marked not found.
 */
export async function cancelOrder(
  input: { orderNo: string; rev: number; reason: string; note: string },
  by: Actor,
): Promise<ActionDone> {
  const d = await load(input.orderNo);
  checkMove(d, "cancelled", input.rev);
  const held = d.reservation?.active === true;
  const committed = stockCommitted(d.status);
  const now = new Date();
  const why = cancelNote(input.reason, input.note);
  const payTo = paymentAfterMove("cancelled", { paymentStatus: d.paymentStatus, reason: input.reason });
  const pay = paymentChange(d, payTo, now, by, "Advance not received");
  let productIds: string[] = [];

  await inTransaction(async (session) => {
    const res = await Order.updateOne(
      asRead(d),
      {
        $set: {
          status: "cancelled",
          cancelReason: why,
          "reservation.active": false,
          ...(held ? { "reservation.releasedAt": now } : {}),
          ...(payTo === "unpaid" && d.advance ? { "advance.status": "not_found" } : {}),
          ...pay.set,
        },
        $inc: { rev: 1 },
        $push: { statusHistory: historyEntry("cancelled", now, by, why), ...pay.push },
      },
      { session },
    );
    if (res.modifiedCount !== 1) throw new OrderActionError(STALE);
    if (held) {
      for (const i of (d.items ?? []) as AnyDoc[]) await giveBack(String(i.variantId), Number(i.qty), session);
    } else if (committed) {
      await restock(d, allLines(d), "cancel", `Order ${d.orderNo} cancelled after confirmation`, by, session);
    }
    if (held || committed) productIds = await syncProducts(d.items ?? [], session);
    if (d.couponCode) {
      await CouponModel.updateOne(
        trustFilter({ code: d.couponCode, usedCount: { $gt: 0 } }),
        { $inc: { usedCount: -1 } },
        { session },
      );
    }
  });

  return { before: toAdminOrder(d), after: await reread(d.orderNo), productIds };
}

// ---------- Packed, shipped, delivered (and back to the call queue) ----------

/**
 * The moves with nothing more to ask: on hold → back to To call, confirmed → packed → shipped →
 * delivered. Delivered means the courier collected the cash, so the order is paid.
 */
export async function moveOrder(
  input: { orderNo: string; rev: number; to: SimpleMove; note: string },
  by: Actor,
): Promise<ActionDone> {
  const d = await load(input.orderNo);
  checkMove(d, input.to, input.rev);
  const now = new Date();
  const set: Record<string, unknown> = { status: input.to };
  let pay: ReturnType<typeof paymentChange> = { set: {}, push: {} };
  if (input.to === "delivered") {
    set.codCollected = Number(d.codAmount ?? 0);
    pay = paymentChange(
      d,
      paymentAfterMove("delivered", { paymentStatus: d.paymentStatus }),
      now,
      by,
      "Delivered: the courier collected the cash",
    );
  }
  const res = await Order.updateOne(asRead(d), {
    $set: { ...set, ...pay.set },
    $inc: { rev: 1 },
    $push: { statusHistory: historyEntry(input.to, now, by, input.note), ...pay.push },
  });
  if (res.modifiedCount !== 1) throw new OrderActionError(STALE);
  return { before: toAdminOrder(d), after: await reread(d.orderNo), productIds: [] };
}

// ---------- Returned and partly delivered: the units come back ----------

/** Returned (RTO from the courier, or a customer return after delivery): every unit goes back into stock. */
export async function returnOrder(
  input: { orderNo: string; rev: number; reason: string; note: string },
  by: Actor,
): Promise<ActionDone> {
  const d = await load(input.orderNo);
  checkMove(d, "returned", input.rev);
  const now = new Date();
  const why = cancelNote(input.reason, input.note);
  let productIds: string[] = [];
  await inTransaction(async (session) => {
    const res = await Order.updateOne(
      asRead(d),
      {
        $set: { status: "returned", returnReason: why },
        $inc: { rev: 1 },
        $push: { statusHistory: historyEntry("returned", now, by, why) },
      },
      { session },
    );
    if (res.modifiedCount !== 1) throw new OrderActionError(STALE);
    await restock(d, allLines(d), "return", `Order ${d.orderNo} returned`, by, session);
    productIds = await syncProducts(d.items ?? [], session);
  });
  return { before: toAdminOrder(d), after: await reread(d.orderNo), productIds };
}

/**
 * Partly delivered: the customer kept some units and the courier brought the rest back. The units
 * that came back go into stock; what the courier collected is saved and the order counts as paid.
 */
export async function partlyDeliverOrder(input: PartialInput, by: Actor): Promise<ActionDone> {
  const d = await load(input.orderNo);
  checkMove(d, "partially_delivered", input.rev);
  const check = checkPartial(allLines(d), input.returned);
  if (!check.ok) throw new OrderActionError(check.error);
  const total = Number(d.total ?? 0);
  if (input.collected > total) throw new OrderActionError("The amount collected is more than the order total.");
  const now = new Date();
  const back = check.lines
    .map((l) => {
      const i = ((d.items ?? []) as AnyDoc[]).find((x) => String(x.variantId) === l.variantId)!;
      return `${l.qty} × ${itemName({ title: i.title, variantTitle: i.variantTitle ?? "" })}`;
    })
    .join(", ");
  const note = [`Came back: ${back}`, input.note].filter(Boolean).join(". ");
  const pay = paymentChange(
    d,
    paymentAfterMove("partially_delivered", { paymentStatus: d.paymentStatus }),
    now,
    by,
    `Partly delivered: the courier collected ৳${(input.collected / 100).toLocaleString("en-US")}`,
  );
  let productIds: string[] = [];
  await inTransaction(async (session) => {
    const res = await Order.updateOne(
      asRead(d),
      {
        $set: {
          status: "partially_delivered",
          returnedItems: check.lines,
          codCollected: input.collected,
          ...pay.set,
        },
        $inc: { rev: 1 },
        $push: { statusHistory: historyEntry("partially_delivered", now, by, note), ...pay.push },
      },
      { session },
    );
    if (res.modifiedCount !== 1) throw new OrderActionError(STALE);
    await restock(d, check.lines, "return", `Order ${d.orderNo} partly delivered`, by, session);
    productIds = await syncProducts(d.items ?? [], session);
  });
  return { before: toAdminOrder(d), after: await reread(d.orderNo), productIds };
}

// ---------- Refund (FR-OR-02) ----------

/**
 * Money sent back to the customer by hand (bKash/Nagad). Only for orders that won't be delivered in
 * full, and never more than the shop received.
 */
export async function refundOrder(
  input: { orderNo: string; rev: number; amount: number; note: string },
  by: Actor,
): Promise<ActionDone> {
  const d = await load(input.orderNo);
  checkRev(d, input.rev);
  const before = toAdminOrder(d);
  if (!canRefund(before)) throw new OrderActionError("This order has nothing to refund.");
  const received = moneyIn(before);
  if (input.amount > received) {
    throw new OrderActionError(
      `That's more than the shop received for this order (৳${(received / 100).toLocaleString("en-US")}).`,
    );
  }
  const now = new Date();
  const pay = paymentChange(d, "refunded", now, by, input.note);
  const res = await Order.updateOne(trustFilter({ ...asRead(d), paymentStatus: d.paymentStatus }), {
    $set: { ...pay.set, refund: { amount: input.amount, note: input.note, at: now, by: by.id, byName: by.name } },
    $inc: { rev: 1 },
    $push: pay.push,
  });
  if (res.modifiedCount !== 1) throw new OrderActionError(STALE);
  return { before, after: await reread(d.orderNo), productIds: [] };
}

// ---------- Calls and notes (any status) ----------

export async function addCall(input: { orderNo: string; outcome: CallOutcome; note: string }, by: Actor) {
  await connectMongoose();
  const res = await Order.updateOne(
    { orderNo: input.orderNo },
    { $push: { callLog: { outcome: input.outcome, note: input.note, at: new Date(), by: by.id, byName: by.name } } },
  );
  if (res.matchedCount !== 1) throw new OrderActionError("This order no longer exists.");
}

export async function addNote(input: { orderNo: string; text: string }, by: Actor) {
  await connectMongoose();
  const res = await Order.updateOne(
    { orderNo: input.orderNo },
    { $push: { notes: { text: input.text, at: new Date(), by: by.id, byName: by.name } } },
  );
  if (res.matchedCount !== 1) throw new OrderActionError("This order no longer exists.");
}

// ---------- Edit before confirmation (FR-OR-08) ----------

export type EditDone = (ActionDone & { changes: string[] }) | { changes: [] };

export async function editOrder(input: OrderEditInput, by: Actor): Promise<EditDone> {
  const d = await load(input.orderNo);
  if (!canEdit(d.status)) throw new OrderActionError("Only pending or on-hold orders can be edited.");
  checkRev(d, input.rev);
  const before = toAdminOrder(d);

  // Where it goes: the area must be in the district, and the district must have a delivery zone.
  const config = await getDeliveryConfig();
  const area = config.areas.find((a) => a.id === input.areaId);
  const district = config.districts.find((x) => x.id === input.districtId);
  if (!area || !district || area.districtId !== district.id) {
    throw new OrderActionError("Choose the district, then an area in it.");
  }
  const zoneId = zoneIdFor(config, area.id);
  const zone = zoneId ? config.zones.find((z) => z.id === zoneId) : undefined;
  if (!zone) throw new OrderActionError("This area has no delivery zone. Set one in Delivery first.");

  // What it holds: lines already on the order keep their price and snapshot; new lines take today's.
  const old = new Map(before.items.map((i) => [i.variantId, i]));
  const added = input.items.filter((i) => !old.has(i.variantId)).map((i) => i.variantId);
  const [facts, extra] = await Promise.all([
    variantFacts(added),
    added.length
      ? Variant.find(trustFilter({ _id: { $in: added } }))
          .select("sku costPrice")
          .lean<AnyDoc[]>()
      : Promise.resolve([] as AnyDoc[]),
  ]);
  const snap = new Map(extra.map((v) => [String(v._id), v]));
  const items: OrderItem[] = input.items.map(({ variantId, qty }) => {
    const was = old.get(variantId);
    if (was) return { ...was, qty };
    const f = facts.get(variantId);
    const s = snap.get(variantId);
    if (!f || !s || !f.sellable) throw new OrderActionError("A product you added is no longer for sale. Remove it.");
    return {
      productId: f.productId,
      variantId,
      title: f.title,
      variantTitle: f.variantTitle,
      sku: String(s.sku),
      slug: f.slug,
      image: f.image?.url ?? null,
      price: f.price,
      cost: Number(s.costPrice ?? 0),
      qty,
      weightGrams: f.weightGrams,
    };
  });

  const totals = editedTotals({
    items,
    discount: input.discount,
    deliveryCharge: input.deliveryCharge,
    codFeePercent: zone.codFeePercent,
    advancePaid: before.advance?.amount ?? 0,
  });
  const after = {
    customer: { name: input.name, phone: input.phone, email: input.email },
    address: { district: district.name.en, area: area.name.en, line: input.address, note: input.note },
    items,
    discount: totals.discount,
    deliveryCharge: totals.deliveryCharge,
    total: totals.total,
  };
  const changes = describeEdit(before, after);
  if (changes.length === 0) return { changes: [] };

  const held = d.reservation?.active === true;
  const now = new Date();
  let productIds: string[] = [];
  await inTransaction(async (session) => {
    const res = await Order.updateOne(
      asRead(d),
      {
        $set: {
          customer: after.customer,
          shippingAddress: {
            districtId: district.id,
            district: district.name.en,
            areaId: area.id,
            area: area.name.en,
            line: input.address,
            note: input.note,
          },
          zoneId: zone.id,
          zoneName: zone.name,
          items,
          subtotal: totals.subtotal,
          discount: totals.discount,
          deliveryCharge: totals.deliveryCharge,
          "delivery.weightGrams": items.reduce((n, i) => n + i.weightGrams * i.qty, 0),
          ...(totals.deliveryCharge !== before.deliveryCharge ? { "delivery.reason": "staff" } : {}),
          codFee: totals.codFee,
          total: totals.total,
          codAmount: totals.codAmount,
        },
        $inc: { rev: 1 },
        $push: { edits: { changes, reason: input.reason, at: now, by: by.id, byName: by.name } },
      },
      { session },
    );
    if (res.modifiedCount !== 1) throw new OrderActionError(STALE);

    if (held) {
      // The hold follows the new quantities: more units are held only if they are free.
      const next = new Map(items.map((i) => [i.variantId, i]));
      for (const v of new Set([...old.keys(), ...next.keys()])) {
        const delta = (next.get(v)?.qty ?? 0) - (old.get(v)?.qty ?? 0);
        if (delta > 0) {
          const r = await Variant.updateOne(
            trustFilter({
              _id: new mongoose.Types.ObjectId(v),
              $expr: { $gte: [{ $subtract: ["$stock", { $ifNull: ["$reserved", 0] }] }, delta] },
            }),
            { $inc: { reserved: delta } },
            { session },
          );
          if (r.modifiedCount !== 1) {
            const i = next.get(v)!;
            throw new OrderActionError(`Not enough stock to add ${delta} more ${itemName(i)}.`);
          }
        } else if (delta < 0) await giveBack(v, -delta, session);
      }
      productIds = await syncProducts([...before.items, ...items], session);
    }
  });

  return { before, after: await reread(d.orderNo), productIds, changes };
}
