import mongoose, { Schema, type Model } from "mongoose";

/**
 * Saved addresses and wishlists (FR-AC-06). One document per address and per saved product, each with
 * the user id. Removed with the account.
 */

const addressSchema = new Schema(
  {
    userId: { type: String, required: true },
    label: { type: String, default: "" },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    districtId: { type: String, required: true },
    areaId: { type: String, required: true },
    line: { type: String, required: true },
    note: { type: String, default: "" },
    isDefault: { type: Boolean, default: false },
  },
  { collection: "addresses", timestamps: true },
);
addressSchema.index({ userId: 1, createdAt: 1 });

const wishlistSchema = new Schema(
  {
    userId: { type: String, required: true },
    productId: { type: String, required: true },
  },
  { collection: "wishlists", timestamps: { createdAt: true, updatedAt: false } },
);
wishlistSchema.index({ userId: 1, productId: 1 }, { unique: true });
wishlistSchema.index({ userId: 1, createdAt: -1 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- reads are mapped field by field
type LooseModel = Model<any>;
// Registered again when this file reloads in development, so a schema change applies without a restart.
if (mongoose.models.Address) mongoose.deleteModel("Address");
if (mongoose.models.WishlistItem) mongoose.deleteModel("WishlistItem");
export const Address: LooseModel = mongoose.model("Address", addressSchema) as unknown as LooseModel;
export const WishlistItem: LooseModel = mongoose.model("WishlistItem", wishlistSchema) as unknown as LooseModel;
