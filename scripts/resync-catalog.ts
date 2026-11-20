/**
 * Recalculates each product's listing numbers (price range, discount, stock) from its variants.
 * Run it after a change to how those numbers are calculated, or if they ever look wrong:
 *
 *   pnpm catalog:resync
 */
import "../worker/load-env";
import mongoose from "mongoose";
import { connectMongoose } from "@/lib/db/mongo";
import { Product } from "@/modules/catalog/models";
import { syncProductFromVariants } from "@/modules/catalog/products";

async function main() {
  await connectMongoose();
  const ids = await Product.find({}).setOptions({ withDeleted: true }).distinct("_id");
  for (const id of ids) await syncProductFromVariants(id);
  console.log(`Re-synced ${ids.length} product(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
