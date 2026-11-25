/**
 * Recalculates each product's listing numbers (price range, discount, stock) from its variants.
 * Run it after a change to how those numbers are calculated, or if they ever look wrong. Then it asks the
 * running store to refresh its pages (needs REVALIDATE_SECRET):
 *
 *   pnpm catalog:resync
 */
import "../worker/load-env";
import mongoose from "mongoose";
import { connectMongoose } from "@/lib/db/mongo";
import { requestStoreRefresh } from "@/lib/store-refresh-client";
import { TAGS } from "@/modules/catalog/cache-tags";
import { Product } from "@/modules/catalog/models";
import { syncProductFromVariants } from "@/modules/catalog/products";

async function main() {
  await connectMongoose();
  const ids = await Product.find({}).setOptions({ withDeleted: true }).distinct("_id");
  for (const id of ids) await syncProductFromVariants(id);
  console.log(`Re-synced ${ids.length} product(s).`);
  // Prices, deals and stock show everywhere, so the whole catalogue is refreshed.
  const refreshed = await requestStoreRefresh([TAGS.catalog]);
  console.log(
    refreshed
      ? "Store pages refreshed."
      : "Could not refresh the store (is it running, and is REVALIDATE_SECRET set?). Pages update within a few hours.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
