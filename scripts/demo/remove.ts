/**
 * Removes exactly what `pnpm demo:seed` created (listed in public/uploads/demo-manifest.json): the demo
 * products with their variants and stock history, the demo categories and collections, and the demo
 * photos. The home page goes back to what it was, unless it has been published from the builder since.
 * Demo items left in carts and wishlists are taken out; orders are never touched.
 *
 *   pnpm demo:remove
 */
import "../../worker/load-env";
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { connectMongoose } from "@/lib/db/mongo";
import { requestStoreRefresh } from "@/lib/store-refresh-client";
import { TAGS } from "@/modules/catalog/cache-tags";
import { Category, Collection, Product, Variant } from "@/modules/catalog/models";
import { Page } from "@/modules/storefront/models";
import { MANIFEST, PHOTO_DIR, PHOTO_PREFIX, readManifest } from "./seed";

async function main() {
  const m = readManifest();
  if (!m) {
    console.log("No demo data found (public/uploads/demo-manifest.json is missing).");
    return;
  }
  await connectMongoose();
  const db = mongoose.connection.db!;
  // Plain id strings: the models turn them into ObjectIds themselves.
  const productIds = m.productIds;

  const variantIds = await Variant.find({ productId: mongoose.trusted({ $in: productIds }) }).distinct("_id");
  const moves = await db.collection("inventoryMovements").deleteMany({ variantId: { $in: variantIds } });
  const variants = await Variant.deleteMany({ productId: mongoose.trusted({ $in: productIds }) });
  const products = await Product.deleteMany({ _id: mongoose.trusted({ $in: productIds }) });
  const collections = await Collection.deleteMany({ _id: mongoose.trusted({ $in: m.collectionIds }) });
  const categories = await Category.deleteMany({ _id: mongoose.trusted({ $in: m.categoryIds }) });

  // Carts and wishlists keep their other items.
  const variantStrings = variantIds.map(String);
  await db.collection("carts").updateMany({ "items.variantId": { $in: variantStrings } }, {
    $pull: { items: { variantId: { $in: variantStrings } } },
  } as never);
  await db.collection("wishlists").deleteMany({ productId: { $in: m.productIds } });

  if (m.homeTouched && m.homeAt) {
    const r = await Page.updateOne(
      { slug: "home", "published.at": new Date(m.homeAt) },
      { $set: { published: m.homePublishedBefore ?? null } },
    );
    console.log(r.modifiedCount ? "Home page restored." : "Home page was changed since, so it was left as it is.");
  }

  for (const f of readdirSync(PHOTO_DIR)) {
    if (f.startsWith(PHOTO_PREFIX)) rmSync(path.join(PHOTO_DIR, f));
  }
  rmSync(MANIFEST, { force: true });
  console.log(
    `Removed ${products.deletedCount} products, ${variants.deletedCount} variants, ${moves.deletedCount} stock moves, ` +
      `${collections.deletedCount} collections, ${categories.deletedCount} categories and the demo photos.`,
  );
  await requestStoreRefresh([TAGS.catalog, TAGS.productLists, TAGS.navigation, TAGS.design]);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
