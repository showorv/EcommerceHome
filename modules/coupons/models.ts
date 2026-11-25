import mongoose, { Schema, type Model } from "mongoose";

/**
 * Coupons (SRS §7 "coupons"). The code is unique and stored upper case. `usedCount` goes up when an order
 * using the coupon is placed (Phase 2.7). Writes are validated by zod first (coupons.ts).
 */
const couponSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    type: { type: String, enum: ["percent", "fixed", "free_delivery"], required: true },
    value: { type: Number, default: 0 },
    minOrder: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: 0 },
    usageLimit: { type: Number, default: 0 },
    perCustomerLimit: { type: Number, default: 1 },
    usedCount: { type: Number, default: 0 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    productIds: { type: [String], default: [] },
    categoryIds: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    note: { type: String, default: "" },
    createdBy: { type: String, default: null },
  },
  { collection: "coupons", timestamps: true },
);
couponSchema.index({ code: 1 }, { unique: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- writes go through coupons/data.ts only
type LooseModel = Model<any>;
export const CouponModel: LooseModel =
  (mongoose.models.Coupon as LooseModel | undefined) ??
  (mongoose.model("Coupon", couponSchema) as unknown as LooseModel);
