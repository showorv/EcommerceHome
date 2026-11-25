import mongoose, { Schema, type Model } from "mongoose";

/**
 * One-time codes (SRS §7 "otps"): at most one live code per number and purpose. Only the HMAC of the
 * code is stored. The TTL index removes a code once it expires.
 */
const otpSchema = new Schema(
  {
    phone: { type: String, required: true },
    purpose: { type: String, required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    sentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    ip: { type: String, default: null },
  },
  { collection: "otps" },
);
otpSchema.index({ phone: 1, purpose: 1 }, { unique: true });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- writes go through otp/service.ts only
type LooseModel = Model<any>;
export const Otp: LooseModel =
  (mongoose.models.Otp as LooseModel | undefined) ?? (mongoose.model("Otp", otpSchema) as unknown as LooseModel);
