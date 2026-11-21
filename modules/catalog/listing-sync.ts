import mongoose from "mongoose";
import { productColours, summariseVariants } from "./logic";
import { Product, Variant } from "./models";

/**
 * Keeps a product's listing fields (price range, discount, stock, colours) in step with its variants.
 * Not marked server-only, so the worker can use it too (stock released from old orders).
 */

const { ObjectId } = mongoose.Types;
type AnyDoc = Record<string, unknown> & { _id: { toString(): string } };

/** Product-level listing fields from its variant documents. */
export function listingFields(variants: AnyDoc[]) {
  const summary = summariseVariants(
    variants.map((v) => ({
      price: Number(v.price),
      compareAtPrice: Number(v.compareAtPrice ?? 0),
      stock: Number(v.stock ?? 0),
      reserved: Number(v.reserved ?? 0),
      active: v.active !== false,
    })),
  );
  const colours = productColours(
    variants.map((v) => {
      const o = (v.options instanceof Map ? Object.fromEntries(v.options) : v.options) ?? {};
      return {
        options: Object.fromEntries(Object.entries(o as Record<string, unknown>).map(([k, val]) => [k, String(val)])),
        active: v.active !== false,
      };
    }),
  );
  return { ...summary, colours };
}

/** Recomputes the product's listing fields after its variants' stock or prices changed. Returns its slug. */
export async function syncProductFromVariants(
  productId: string | mongoose.Types.ObjectId,
  session?: mongoose.ClientSession,
) {
  const pid = typeof productId === "string" ? new ObjectId(productId) : productId;
  const q = Variant.find({ productId: pid });
  if (session) q.session(session);
  const variants = await q.lean<AnyDoc[]>();
  await Product.updateOne({ _id: pid }, listingFields(variants), { session }).setOptions({ withDeleted: true });
  const p = await Product.findById(pid)
    .setOptions({ withDeleted: true })
    .select("slug")
    .session(session ?? null)
    .lean<AnyDoc>();
  return p ? String(p.slug ?? "") : null;
}
