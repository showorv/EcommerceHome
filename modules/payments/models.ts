import mongoose, { Schema, type Model } from "mongoose";

/**
 * Store settings (SRS §7 "settings"): one document per area, keyed by `_id` ("payments", …). Writes are
 * validated by zod first (payments.ts) and read back by hand.
 */
const settingSchema = new Schema(
  {
    _id: { type: String, required: true },
    value: { type: Schema.Types.Mixed, default: {} },
    updatedBy: { type: String, default: null },
  },
  { collection: "settings", timestamps: true, minimize: false },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- writes go through payments/data.ts only
type LooseModel = Model<any>;
export const Setting: LooseModel =
  (mongoose.models.Setting as LooseModel | undefined) ??
  (mongoose.model("Setting", settingSchema) as unknown as LooseModel);
