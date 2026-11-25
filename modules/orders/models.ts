import mongoose, { Schema, type Model } from "mongoose";
import { ORDER_STATUSES, PAYMENT_STATUSES } from "./orders";
import { CALL_OUTCOMES } from "./staff";

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
    byName: { type: String, default: "" },
    note: { type: String, default: "" },
  },
  { _id: false },
);

/** Payment status changes, kept apart from the order's (FR-OR-02). */
const paymentHistorySchema = new Schema(
  {
    status: { type: String, enum: PAYMENT_STATUSES, required: true },
    at: { type: Date, required: true },
    by: { type: String, default: null },
    byName: { type: String, default: "" },
    note: { type: String, default: "" },
  },
  { _id: false },
);

/** Staff calls to the customer (FR-OR-09). */
const callSchema = new Schema(
  {
    outcome: { type: String, enum: CALL_OUTCOMES, required: true },
    note: { type: String, default: "" },
    at: { type: Date, required: true },
    by: { type: String, required: true },
    byName: { type: String, default: "" },
  },
  { _id: false },
);

const noteSchema = new Schema(
  {
    text: { type: String, required: true },
    at: { type: Date, required: true },
    by: { type: String, required: true },
    byName: { type: String, default: "" },
  },
  { _id: false },
);

/** Staff changes before confirmation, in words (FR-OR-08). The audit log keeps before/after too. */
const editSchema = new Schema(
  {
    changes: { type: [String], default: [] },
    reason: { type: String, default: "" },
    at: { type: Date, required: true },
    by: { type: String, required: true },
    byName: { type: String, default: "" },
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
          /** pending → verified, or not_found when it never arrived. */
          status: { type: String, enum: ["pending", "verified", "not_found"], default: "pending" },
          verifiedBy: { type: String, default: null },
          verifiedByName: { type: String, default: "" },
          verifiedAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    codAmount: { type: Number, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, required: true },
    paymentHistory: { type: [paymentHistorySchema], default: [] },
    /** What the courier collected at the door (delivered or partly delivered). */
    codCollected: { type: Number, default: 0, min: 0 },
    refund: {
      type: new Schema(
        {
          amount: { type: Number, required: true, min: 0 },
          note: { type: String, default: "" },
          at: { type: Date, required: true },
          by: { type: String, required: true },
          byName: { type: String, default: "" },
        },
        { _id: false },
      ),
      default: null,
    },
    status: { type: String, enum: ORDER_STATUSES, required: true },
    statusHistory: { type: [historySchema], default: [] },
    reservation: {
      active: { type: Boolean, default: true },
      until: { type: Date, required: true },
      releasedAt: { type: Date, default: null },
      /** Confirmed: the held units left the stock for good. */
      committedAt: { type: Date, default: null },
    },
    riskScore: { type: Number, default: 0 },
    riskLevel: { type: String, enum: ["low", "medium", "high"], default: "low" },
    riskReasons: { type: [String], default: [] },
    callLog: { type: [callSchema], default: [] },
    notes: { type: [noteSchema], default: [] },
    edits: { type: [editSchema], default: [] },
    confirmedAt: { type: Date, default: null },
    confirmedBy: { type: String, default: null },
    cancelReason: { type: String, default: "" },
    returnReason: { type: String, default: "" },
    /** Partly delivered: the units that came back (they went back into stock). */
    returnedItems: {
      type: [new Schema({ variantId: String, qty: Number }, { _id: false })],
      default: [],
    },
    /** Goes up with every staff change: a change based on an older copy is refused. */
    rev: { type: Number, default: 0 },
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
orderSchema.index({ zoneId: 1, createdAt: -1 });
// Pending orders whose stock hold has run out (FR-CO-07).
orderSchema.index({ "reservation.until": 1 }, { partialFilterExpression: { "reservation.active": true } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- writes go through place.ts, reads mapped by hand
type LooseModel = Model<any>;
// Registered again when this file reloads in development, so a schema change applies without a restart
// (a model kept from before would quietly drop new fields).
if (mongoose.models.Order) mongoose.deleteModel("Order");
export const Order: LooseModel = mongoose.model("Order", orderSchema) as unknown as LooseModel;
