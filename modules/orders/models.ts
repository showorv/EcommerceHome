import mongoose, { Schema, type Model } from "mongoose";
import { ORDER_STATUSES, PAYMENT_STATUSES } from "./orders";

/**
 * Orders (SRS §7 "orders"). Written by place.ts in one transaction with the stock reservation; read
 * back by hand. Items are a snapshot (title, price, cost) so later product edits never change an order.
 */

const itemSchema = new Schema(
  {
    productId: { type: String, required: true },
    variantId: { type: String, required: true },
    title: { type: String, required: true },
    variantTitle: { type: String, default: "" },
    sku: { type: String, required: true },
    slug: { type: String, default: "" },
    image: { type: String, default: null },
    price: { type: Number, required: true, min: 0 },
    cost: { type: Number, default: 0, min: 0 },
    qty: { type: Number, required: true, min: 1 },
    weightGrams: { type: Number, default: 0 },
  },
  { _id: false },
);

const historySchema = new Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, required: true },
    by: { type: String, default: null },
    note: { type: String, default: "" },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNo: { type: String, required: true },
    userId: { type: String, default: null },
    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, default: "" },
    },
    shippingAddress: {
      districtId: String,
      district: String,
      areaId: String,
      area: String,
      line: String,
      note: { type: String, default: "" },
    },
    zoneId: { type: String, required: true },
    zoneName: { type: String, default: "" },
    items: { type: [itemSchema], required: true },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    couponCode: { type: String, default: null },
    deliveryCharge: { type: Number, required: true },
    delivery: {
      reason: String,
      regularCharge: Number,
      weightGrams: Number,
      minDays: Number,
      maxDays: Number,
    },
    codFee: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paymentMethod: { type: String, required: true },
    advance: {
      type: new Schema(
        {
          method: String,
          senderNumber: String,
          trxId: String,
          amount: Number,
          status: { type: String, default: "pending" },
          verifiedBy: { type: String, default: null },
          verifiedAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    codAmount: { type: Number, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, required: true },
    status: { type: String, enum: ORDER_STATUSES, required: true },
    statusHistory: { type: [historySchema], default: [] },
    reservation: {
      active: { type: Boolean, default: true },
      until: { type: Date, required: true },
      releasedAt: { type: Date, default: null },
    },
    riskScore: { type: Number, default: 0 },
    riskReasons: { type: [String], default: [] },
    callLog: { type: [Schema.Types.Mixed], default: [] },
    notes: { type: [Schema.Types.Mixed], default: [] },
    source: { type: String, default: "web" },
    utm: { type: Schema.Types.Mixed, default: null },
    courier: { type: Schema.Types.Mixed, default: null },
    invoiceId: { type: String, default: null },
    idempotencyKey: { type: String, required: true },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { collection: "orders", timestamps: true, minimize: false },
);

orderSchema.index({ orderNo: 1 }, { unique: true });
orderSchema.index({ idempotencyKey: 1 }, { unique: true });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ "customer.phone": 1, createdAt: -1 });
orderSchema.index({ userId: 1, createdAt: -1 }, { partialFilterExpression: { userId: { $type: "string" } } });
// One TrxID, one order (SRS §7): only orders with an advance have one.
orderSchema.index(
  { "advance.trxId": 1 },
  { unique: true, partialFilterExpression: { "advance.trxId": { $type: "string" } } },
);
orderSchema.index({ couponCode: 1 }, { partialFilterExpression: { couponCode: { $type: "string" } } });
// Pending orders whose stock hold has run out (FR-CO-07).
orderSchema.index({ "reservation.until": 1 }, { partialFilterExpression: { "reservation.active": true } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- writes go through place.ts, reads mapped by hand
type LooseModel = Model<any>;
export const Order: LooseModel =
  (mongoose.models.Order as LooseModel | undefined) ?? (mongoose.model("Order", orderSchema) as unknown as LooseModel);
