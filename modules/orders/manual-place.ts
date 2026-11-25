import "server-only";
import mongoose from "mongoose";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { variantFacts } from "@/modules/cart/data";
import { syncProductFromVariants } from "@/modules/catalog/listing-sync";
import { Variant } from "@/modules/catalog/models";
import { zoneForArea } from "@/modules/checkout/checkout";
import { BLOCKED_MESSAGE } from "@/modules/customers/blocks";
import { deliveryQuote } from "@/modules/delivery/charge";
import { getDeliveryConfig } from "@/modules/delivery/data";
import { notifyOrder } from "@/modules/notifications/send";
import { getPaymentConfig, isTrxIdUsed } from "@/modules/payments/data";
import { nextSequenceInSession } from "@/modules/shared/counters";
import { buildManualOrder, manualTotals, type ManualOrderInput } from "./manual";
import { Order } from "./models";
import { formatOrderNo, ORDER_NO_START, type OrderItem } from "./orders";
import { findPlacedOrder, lowStockProducts, orderKeyHash, reservationHours, type PlacedOrder } from "./place";
import { assessCheckout } from "./rules-data";

/**
 * Saves a manual order (Open question 9) the way checkout does: in one transaction it holds the stock
 * (only if enough is free), takes the next order number and saves the order. The same form key from the
 * same staff member always gives back the same order. Callers check orders.create and write the audit.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

export type ManualPlaceResult =
  | { ok: true; order: PlacedOrder; repeated: boolean; lowStockProductIds: string[] }
  | { ok: false; error: string; fields?: Partial<Record<string, string>> };

class StopError extends Error {}

const fieldError = (field: string, message: string): ManualPlaceResult => ({
  ok: false,
  error: "Please check the highlighted fields.",
  fields: { [field]: message },
});

export async function placeManualOrder(
  f: ManualOrderInput,
  by: { id: string; name: string },
): Promise<ManualPlaceResult> {
  await connectMongoose();
  await Order.init();
  const owner = `staff:${by.id}`;
  const done = await findPlacedOrder(owner, f.key);
  if (done) return { ok: true, order: done, repeated: true, lowStockProductIds: [] };

  const [config, payments, facts, skus, hours] = await Promise.all([
    getDeliveryConfig(),
    getPaymentConfig(),
    variantFacts(f.items.map((i) => i.variantId)),
    Variant.find(trustFilter({ _id: { $in: f.items.map((i) => i.variantId) } }))
      .select("sku costPrice")
      .lean<AnyDoc[]>(),
    reservationHours(),
  ]);

  // Where it goes.
  const area = config.areas.find((a) => a.id === f.areaId);
  if (!area || area.districtId !== f.districtId) return fieldError("areaId", "Choose the district, then an area in it");
  const zone = zoneForArea(config, f.areaId);
  if (!zone) return fieldError("areaId", "This area has no delivery zone switched on");
  const district = config.districts.find((d) => d.id === f.districtId)?.name.en ?? "";

  // What's in it, at today's prices.
  const sku = new Map(skus.map((v) => [String(v._id), v]));
  const items: OrderItem[] = [];
  for (const it of f.items) {
    const v = facts.get(it.variantId);
    const s = sku.get(it.variantId);
    if (!v || !s || !v.sellable) return fieldError("items", "A product in the list is no longer on sale. Remove it.");
    if (v.available < it.qty) {
      const name = v.variantTitle ? `${v.title} (${v.variantTitle})` : v.title;
      return fieldError("items", `Only ${v.available} of ${name} free right now.`);
    }
    items.push({
      productId: v.productId,
      variantId: it.variantId,
      title: v.title,
      variantTitle: v.variantTitle,
      sku: String(s.sku),
      slug: v.slug,
      image: v.image?.url ?? null,
      price: v.price,
      cost: Number(s.costPrice ?? 0),
      qty: it.qty,
      weightGrams: v.weightGrams,
    });
  }

  const now = new Date();
  const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);
  const quote = deliveryQuote({
    zone,
    rules: config.rules,
    lines: items,
    subtotal: subtotal - Math.min(subtotal, f.discount),
    now: now.getTime(),
  });
  const totals = manualTotals({
    items,
    discount: f.discount,
    deliveryCharge: f.deliveryCharge ?? quote.charge,
    codFeePercent: zone.codFeePercent,
    advancePaid: f.advanceAmount,
  });
  if (totals.overpaid > 0) return fieldError("advanceAmount", "The advance is more than the order total.");
  if (f.trxId && (await isTrxIdUsed(f.trxId))) return fieldError("trxId", "This TrxID is already on another order.");

  // Blocked numbers can't order here either; flags and the order rules show up as the risk score.
  const assessed = await assessCheckout({
    phone: f.phone,
    name: f.name,
    ip: null,
    subtotal,
    zone,
    zones: config.zones,
    walletCount: payments.wallets.length,
  });
  if (assessed.blocked) return fieldError("phone", `${BLOCKED_MESSAGE} (Admin → Blocked numbers)`);

  const idempotencyKey = orderKeyHash(owner, f.key);
  const session = await mongoose.startSession();
  let doc: ReturnType<typeof buildManualOrder> | null = null;
  let orderId = "";
  try {
    await session.withTransaction(async () => {
      for (const i of items) {
        const res = await Variant.updateOne(
          trustFilter({
            _id: new mongoose.Types.ObjectId(i.variantId),
            active: true,
            $expr: { $gte: [{ $subtract: ["$stock", { $ifNull: ["$reserved", 0] }] }, i.qty] },
          }),
          { $inc: { reserved: i.qty } },
          { session },
        );
        if (res.modifiedCount !== 1) {
          throw new StopError(`${i.variantTitle ? `${i.title} (${i.variantTitle})` : i.title} just sold out.`);
        }
      }
      doc = buildManualOrder({
        orderNo: formatOrderNo(await nextSequenceInSession(session, "orderNo", ORDER_NO_START)),
        idempotencyKey,
        form: f,
        items,
        totals,
        zone: { id: zone.id, name: zone.name },
        district,
        area: area.name.en,
        quote,
        risk: assessed.decision.risk,
        by,
        now,
        reservationHours: hours,
      });
      const [created] = await Order.create([doc], { session });
      orderId = String(created!._id);
      if (f.staffNote) {
        await Order.updateOne(
          { _id: created!._id },
          { $push: { notes: { text: f.staffNote, at: now, by: by.id, byName: by.name } } },
          { session },
        );
      }
      for (const productId of new Set(items.map((i) => i.productId))) {
        await syncProductFromVariants(productId, session);
      }
    });
  } catch (err) {
    if (err instanceof StopError) return fieldError("items", err.message);
    const dup = err as { code?: number; keyPattern?: Record<string, unknown> };
    if (dup.code === 11000 && dup.keyPattern?.idempotencyKey) {
      const first = await findPlacedOrder(owner, f.key);
      if (first) return { ok: true, order: first, repeated: true, lowStockProductIds: [] };
    }
    if (dup.code === 11000 && dup.keyPattern?.["advance.trxId"]) {
      return fieldError("trxId", "This TrxID is already on another order.");
    }
    throw err;
  } finally {
    await session.endSession();
  }

  const saved = doc as ReturnType<typeof buildManualOrder> | null;
  if (!saved) throw new Error("Manual order transaction finished without an order");
  // The same "order received" SMS/email as a website order.
  await notifyOrder("order_received", {
    id: orderId,
    orderNo: saved.orderNo,
    customer: saved.customer,
    total: saved.total,
    codAmount: saved.codAmount,
  });
  return {
    ok: true,
    order: { id: orderId, orderNo: saved.orderNo, total: saved.total },
    repeated: false,
    lowStockProductIds: await lowStockProducts(items.map((i) => i.variantId)),
  };
}
