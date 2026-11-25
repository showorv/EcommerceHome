/**
 * Sets up a k6 load test (Phase 3.2) against a running production build (`pnpm build && pnpm start`):
 * a temporary in-stock product for the test orders, test phone numbers that count as confirmed by SMS
 * code (OTP SMS delivery is outside the SRS timing target), and the current build's server action ids.
 * Writes everything to .loadtest/run.json, which k6 reads and `pnpm load:cleanup` uses to remove it all.
 *
 *   pnpm load:prepare && pnpm load:run && pnpm load:cleanup
 *
 * Never run this against the live shop: it creates real orders.
 */
import "../../worker/load-env";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import mongoose from "mongoose";
import { connectMongoose } from "@/lib/db/mongo";
import { env } from "@/lib/env";
import { Product, Variant } from "@/modules/catalog/models";
import { syncProductFromVariants } from "@/modules/catalog/listing-sync";
import { zoneForArea } from "@/modules/checkout/checkout";
import { CHECKOUT_OTP_PURPOSE } from "@/modules/checkout/phone";
import { loadDeliveryData } from "@/modules/delivery/data";
import { signVerifiedPhone } from "@/modules/otp/codes";

const PHONES = 600; // more than 20/min × 10 min, plus a smoke run
const ACTIONS = ["addToCartAction", "submitCheckoutAction"] as const;

function actionIds(): Record<(typeof ACTIONS)[number], string> {
  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as {
    node: Record<string, { exportedName?: string }>;
  };
  const out: Partial<Record<(typeof ACTIONS)[number], string>> = {};
  for (const [id, v] of Object.entries(manifest.node)) {
    const name = ACTIONS.find((a) => a === v.exportedName);
    if (name) out[name] = id;
  }
  for (const a of ACTIONS) if (!out[a]) throw new Error(`No ${a} in the build. Run pnpm build first.`);
  return out as Record<(typeof ACTIONS)[number], string>;
}

async function main() {
  if (env().NODE_ENV === "production" && env().APP_URL.startsWith("https://")) {
    throw new Error("Refusing to create load-test orders on an https (live) shop.");
  }
  const actions = actionIds();
  await connectMongoose();
  const startedAt = new Date();
  const db = mongoose.connection.db!;
  const hadOrderCounter = (await db.collection("counters").countDocuments({ _id: "orderNo" as never })) > 0;

  // Where the orders go: the first switched-on area whose zone takes cash on delivery.
  const delivery = await loadDeliveryData();
  const zones = delivery.zones.filter((z) => z.active);
  const area = delivery.areas.find((a) => {
    if (!a.active) return false;
    const zone = zoneForArea({ ...delivery, zones }, a.id);
    return zone !== null && zone.advanceRule === "none";
  });
  if (!area) throw new Error("No delivery area takes cash on delivery.");

  const stamp = startedAt.getTime().toString(36);
  const product = await Product.create({
    title: { en: `Load test item ${stamp}` },
    slug: `load-test-${stamp}`,
    status: "active",
    publishedAt: startedAt,
  });
  const variant = await Variant.create({
    productId: product._id,
    sku: `LOADTEST-${stamp}`,
    price: 50_000,
    costPrice: 30_000,
    weightGrams: 300,
    stock: 100_000,
  });
  await syncProductFromVariants(String(product._id));

  // 013 0xxx xxxx: valid-looking numbers set aside for the test.
  const expiresAt = Date.now() + 2 * 3600_000;
  const block = String(startedAt.getTime() % 10_000).padStart(4, "0");
  const phones = Array.from({ length: PHONES }, (_, i) => {
    const local = `0130${block}${String(i).padStart(3, "0")}`;
    const phone = `+88${local}`;
    return { local, token: signVerifiedPhone(env().BETTER_AUTH_SECRET, phone, CHECKOUT_OTP_PURPOSE, expiresAt) };
  });

  mkdirSync(".loadtest", { recursive: true });
  writeFileSync(
    ".loadtest/run.json",
    JSON.stringify(
      {
        startedAt: startedAt.toISOString(),
        baseUrl: env().APP_URL,
        hadOrderCounter,
        productId: String(product._id),
        variantId: String(variant._id),
        slug: product.slug,
        districtId: area.districtId,
        areaId: area.id,
        actions,
        phones,
      },
      null,
      2,
    ),
  );
  console.log(
    `Ready: product ${product.slug}, ${PHONES} test numbers, area ${area.name.en}. Wrote .loadtest/run.json.`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
