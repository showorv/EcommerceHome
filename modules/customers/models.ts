import mongoose, { Schema, type Model } from "mongoose";
import { BLOCK_KINDS } from "./blocks";

/** Blocked and flagged numbers (SRS §7 "blockedContacts"). One entry per phone. */
const blockedContactSchema = new Schema(
  {
    phone: { type: String, required: true },
    kind: { type: String, enum: BLOCK_KINDS, required: true },
    reason: { type: String, default: "" },
    byUserId: { type: String, default: null },
    byName: { type: String, default: "" },
  },
  { collection: "blockedContacts", timestamps: true },
);
blockedContactSchema.index({ phone: 1 }, { unique: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- writes go through customers/data.ts only
type LooseModel = Model<any>;
export const BlockedContact: LooseModel =
  (mongoose.models.BlockedContact as LooseModel | undefined) ??
  (mongoose.model("BlockedContact", blockedContactSchema) as unknown as LooseModel);
