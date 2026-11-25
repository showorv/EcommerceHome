import mongoose, { Schema, type Model } from "mongoose";

/**
 * Delivery data (SRS §7 "locations", "deliveryZones"; FR-AD-08).
 * - locations: division → district → area. An area's zone is its own `zoneId`, else its district's.
 * - deliveryZones: charges, COD fee, free-delivery threshold, advance rule, courier, delivery days.
 * - deliveryRules: one document with the store-wide rules (packaging weight, free delivery, campaign).
 * Writes are validated by zod (charge.ts) first.
 */

const i18n = { en: { type: String, required: true, trim: true }, bn: { type: String, default: "", trim: true } };

const locationSchema = new Schema(
  {
    type: { type: String, enum: ["division", "district", "area"], required: true },
    name: i18n,
    parentId: { type: Schema.Types.ObjectId, ref: "Location", default: null },
    zoneId: { type: Schema.Types.ObjectId, ref: "DeliveryZone", default: null },
    active: { type: Boolean, default: true },
    /** Added by the admin (not from the starter list). */
    custom: { type: Boolean, default: false },
  },
  { collection: "locations", timestamps: true },
);
locationSchema.index({ type: 1, parentId: 1 });
locationSchema.index({ zoneId: 1 });

const zoneSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    baseCharge: { type: Number, required: true, min: 0 }, // poisha
    baseWeightGrams: { type: Number, default: 1000, min: 0 },
    extraPerKg: { type: Number, default: 0, min: 0 }, // poisha
    codFeePercent: { type: Number, default: 0, min: 0 },
    freeAbove: { type: Number, default: 0, min: 0 }, // poisha; 0 = store-wide rule
    advanceRule: { type: String, enum: ["none", "delivery", "full"], default: "none" },
    courier: { type: String, enum: ["none", "steadfast", "pathao", "redx"], default: "none" },
    minDays: { type: Number, default: 1 },
    maxDays: { type: Number, default: 3 },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { collection: "deliveryZones", timestamps: true },
);

const rulesSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    rules: { type: Schema.Types.Mixed, default: {} },
    /** Set once the starter locations and zones were added. */
    seededAt: { type: Date, default: null },
  },
  { collection: "deliveryRules", timestamps: true },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- writes validated by zod, reads mapped by hand
type LooseModel = Model<any>;
function model(name: string, schema: Schema): LooseModel {
  return (mongoose.models[name] as LooseModel | undefined) ?? mongoose.model(name, schema);
}

export const Location = model("Location", locationSchema);
export const DeliveryZone = model("DeliveryZone", zoneSchema);
export const DeliveryRulesDoc = model("DeliveryRules", rulesSchema);
