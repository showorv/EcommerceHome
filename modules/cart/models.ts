import mongoose, { Schema, type Model } from "mongoose";

/**
 * Carts (SRS §7 "carts"): one per signed-in customer (userId) or per guest browser (guestToken, stored
 * as a SHA-256 hash; the browser holds the token in an httpOnly cookie). `rev` guards against two
 * tabs writing at once. Old carts are removed by the TTL index on expiresAt.
 */
const cartSchema = new Schema(
  {
    userId: { type: String, default: null },
    guestTokenHash: { type: String, default: null },
    items: {
      type: [{ _id: false, variantId: { type: String, required: true }, qty: { type: Number, required: true } }],
      default: [],
    },
    couponCode: { type: String, default: null },
    rev: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { collection: "carts", timestamps: true },
);
cartSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: "string" } } });
cartSchema.index(
  { guestTokenHash: 1 },
  { unique: true, partialFilterExpression: { guestTokenHash: { $type: "string" } } },
);
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- writes go through cart/data.ts, reads mapped by hand
type LooseModel = Model<any>;
export const Cart: LooseModel = (mongoose.models.Cart as LooseModel | undefined) ?? mongoose.model("Cart", cartSchema);
