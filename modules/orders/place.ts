import "server-only";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { Cart } from "@/modules/cart/models";
import { syncProductFromVariants } from "@/modules/catalog/listing-sync";
import { Product, Variant } from "@/modules/catalog/models";
import type { CheckoutCheck } from "@/modules/checkout/data";
import { CouponModel } from "@/modules/coupons/models";
import { notifyOrder } from "@/modules/notifications/send";
import { Setting } from "@/modules/payments/models";
import { nextSequenceInSession } from "@/modules/shared/counters";
import { Order } from "./models";
import {
  buildOrder,
  DEFAULT_RESERVATION_HOURS,
  formatOrderNo,
  ORDER_NO_START,
  ORDERS_PER_PHONE_PER_HOUR,
  showsLowStock,
  type NewOrder,
  type VariantSnapshot,
} from "./orders";

/**
 * Order placement (FR-CO-05…07, NFR-SC-07, SRS §6.3). Runs after checkCheckout has checked and priced
 * everything. One MongoDB transaction holds the stock (only if enough is left), counts the coupon use,
 * saves the order and empties those lines from the cart; if any step fails, none of it happens.
 * The same order key from the same browser always gives back the same order (FR-CO-06).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;
type Checked = Extract<CheckoutCheck, { ok: true }>;

export type PlacedOrder = { id: string; orderNo: string; total: number };

export type PlaceResult =
  | { ok: true; order: PlacedOrder; repeated: boolean; lowStockProductIds: string[] }
  | { ok: false; error: string; field?: "trxId" | "couponCode"; cartChanged?: true };

/** Problems the transaction raises to stop and undo itself. */
class PlaceError extends Error {
  constructor(
    message: string,
    readonly field?: "trxId" | "couponCode",
    readonly cartChanged?: true,
  ) {
    super(message);
  }
}

/** The stored key: the browser's key tied to who sent it, so one browser can't land on another's order. */
export const orderKeyHash = (owner: string, key: string) =>
  createHash("sha256").update(`order-key:v1:${owner}:${key}`).digest("hex");

const placed = (d: AnyDoc): PlacedOrder => ({ id: String(d._id), orderNo: String(d.orderNo), total: Number(d.total) });

/** The order this browser already placed with this key (a double click, or a retry after a lost reply). */
export async function findPlacedOrder(owner: string, key: string): Promise<PlacedOrder | null> {
  await connectMongoose();
  const d = await Order.findOne({ idempotencyKey: orderKeyHash(owner, key) })
    .select("orderNo total")
    .lean<AnyDoc>();
  return d ? placed(d) : null;
}

export async function reservationHours(): Promise<number> {
  const s = await Setting.findById("orders").lean<AnyDoc>();
  const h = Number(s?.value?.reservationHours);
  return Number.isFinite(h) && h >= 1 && h <= 24 * 14 ? h : DEFAULT_RESERVATION_HOURS;
}

export async function placeOrder(input: {
  check: Checked;
  /** The browser's key for this attempt (already checked to be a UUID). */
  key: string;
  /** Who is ordering, for the key: the account, the guest cart or the IP. */
  owner: string;
  /** The cart the ordered lines are taken out of. */
  cartId: string | null;
  userId: string | null;
  ip: string | null;
  userAgent: string | null;
}): Promise<PlaceResult> {
  const { check } = input;
  await connectMongoose();
  // Make sure the collection and its unique indexes exist before the first transaction writes to it.
  await Order.init();

  const idempotencyKey = orderKeyHash(input.owner, input.key);
  const existing = await findPlacedOrder(input.owner, input.key);
  if (existing) return { ok: true, order: existing, repeated: true, lowStockProductIds: [] };

  const since = new Date(Date.now() - 3600_000);
  const recent = await Order.countDocuments(
    trustFilter({ "customer.phone": check.input.phone, createdAt: { $gte: since } }),
  );
  if (recent >= ORDERS_PER_PHONE_PER_HOUR) {
    return {
      ok: false,
      error: "This number has placed several orders in the last hour. Please call us to order more.",
    };
  }

  const lines = check.cart.lines;
  const variantIds = lines.map((l) => l.variantId);
  const { cartId } = input;
  const [snapshots, hours] = await Promise.all([
    Variant.find(trustFilter({ _id: { $in: variantIds } }))
      .select("sku costPrice")
      .lean<AnyDoc[]>(),
    reservationHours(),
  ]);
  const snapshot = new Map<string, VariantSnapshot>(
    snapshots.map((v) => [String(v._id), { sku: String(v.sku), cost: Number(v.costPrice ?? 0) }]),
  );
  if (snapshot.size !== new Set(variantIds).size) {
    return { ok: false, error: "Some products in your cart changed. Please check your cart.", cartChanged: true };
  }

  const now = new Date();
  const build = (orderNo: string) =>
    buildOrder({
      orderNo,
      idempotencyKey,
      checkout: check.input,
      lines,
      totals: check.totals,
      zone: check.zone,
      district: check.district,
      area: check.area,
      snapshot,
      userId: input.userId,
      ip: input.ip,
      userAgent: input.userAgent,
      now,
      reservationHours: hours,
      risk: check.risk.risk,
    });

  const session = await mongoose.startSession();
  let orderId = "";
  let doc = null as NewOrder | null; // set inside the transaction
  try {
    await session.withTransaction(async () => {
      for (const l of lines) {
        // Hold the stock only if this many are still free (stock − reserved ≥ qty): no overselling.
        const res = await Variant.updateOne(
          trustFilter({
            _id: new mongoose.Types.ObjectId(l.variantId),
            active: true,
            $expr: { $gte: [{ $subtract: ["$stock", { $ifNull: ["$reserved", 0] }] }, l.qty] },
          }),
          { $inc: { reserved: l.qty } },
          { session },
        );
        if (res.modifiedCount !== 1) {
          const name = l.variantTitle ? `${l.title} (${l.variantTitle})` : l.title;
          throw new PlaceError(
            `Sorry, ${name} just sold out or has fewer left. Please check your cart.`,
            undefined,
            true,
          );
        }
      }
      if (check.input.couponCode) {
        const res = await CouponModel.updateOne(
          trustFilter({
            code: check.input.couponCode,
            active: true,
            $or: [{ usageLimit: 0 }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }],
          }),
          { $inc: { usedCount: 1 } },
          { session },
        );
        if (res.modifiedCount !== 1) throw new PlaceError("This code has just been used up.", "couponCode");
      }
      // Taken last and inside the transaction: a failed order gives its number back (no gaps).
      doc = build(formatOrderNo(await nextSequenceInSession(session, "orderNo", ORDER_NO_START)));
      const [created] = await Order.create([doc], { session });
      orderId = String(created!._id);
      if (cartId) {
        // The ordered lines leave the cart with the order (and come back if it fails).
        await Cart.updateOne(
          { _id: cartId },
          { $pull: { items: { variantId: { $in: variantIds } } }, $inc: { rev: 1 } },
          { session },
        );
      }
      for (const productId of new Set(lines.map((l) => l.productId))) {
        await syncProductFromVariants(productId, session);
      }
    });
  } catch (err) {
    if (err instanceof PlaceError) {
      return { ok: false, error: err.message, field: err.field, cartChanged: err.cartChanged };
    }
    const dup = err as { code?: number; keyPattern?: Record<string, unknown> };
    if (dup.code === 11000 && dup.keyPattern?.idempotencyKey) {
      // The same order sent twice at once: the other request saved it.
      const first = await Order.findOne({ idempotencyKey }).select("orderNo total").lean<AnyDoc>();
      if (first) return { ok: true, order: placed(first), repeated: true, lowStockProductIds: [] };
    }
    if (dup.code === 11000 && dup.keyPattern?.["advance.trxId"]) {
      return {
        ok: false,
        error: "Please check the highlighted fields.",
        field: "trxId",
      };
    }
    throw err;
  } finally {
    await session.endSession();
  }

  if (!doc) throw new Error("Order transaction finished without an order");
  // After the order is safe: the "order received" SMS and email (a failed send never undoes the order).
  await notifyOrder("order_received", {
    id: orderId,
    orderNo: doc.orderNo,
    customer: doc.customer,
    total: doc.total,
    codAmount: doc.codAmount,
  });

  return {
    ok: true,
    order: { id: orderId, orderNo: doc.orderNo, total: doc.total },
    repeated: false,
    lowStockProductIds: await lowStockProducts(lines.map((l) => l.variantId)),
  };
}

/** Products whose page now shows "Only N left" or "Sold out" for a variant in this order. */
export async function lowStockProducts(variantIds: string[]): Promise<string[]> {
  const variants = await Variant.find(trustFilter({ _id: { $in: variantIds } }))
    .select("productId stock reserved lowStockAt")
    .lean<AnyDoc[]>();
  const products = await Product.find(trustFilter({ _id: { $in: [...new Set(variants.map((v) => v.productId))] } }))
    .select("lowStockAt")
    .lean<AnyDoc[]>();
  const threshold = new Map(products.map((p) => [String(p._id), Number(p.lowStockAt ?? 5)]));
  const out = new Set<string>();
  for (const v of variants) {
    const t = v.lowStockAt != null ? Number(v.lowStockAt) : (threshold.get(String(v.productId)) ?? 5);
    if (showsLowStock({ stock: Number(v.stock ?? 0), reserved: Number(v.reserved ?? 0) }, t)) {
      out.add(String(v.productId));
    }
  }
  return [...out];
}
