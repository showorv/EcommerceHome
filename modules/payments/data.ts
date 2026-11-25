import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connectMongoose } from "@/lib/db/mongo";
import { TAGS } from "@/modules/catalog/cache-tags";
import { Setting } from "./models";
import { readPaymentSettings, type PaymentSettings, type Wallet } from "./payments";

/**
 * Payment settings (SRS §2.1): the receiving bKash / Nagad wallets. Callers check permissions, write the
 * audit log and refresh the "payments" cache tag.
 */

const KEY = "payments";

export async function loadPaymentSettings(): Promise<PaymentSettings> {
  await connectMongoose();
  const doc = await Setting.findById(KEY).lean<{ value?: unknown }>();
  return readPaymentSettings(doc?.value);
}

/** What checkout shows: only the wallets that are switched on. Cached until the settings change. */
export async function getPaymentConfig(): Promise<{ wallets: Wallet[] }> {
  "use cache";
  cacheTag(TAGS.payments);
  cacheLife("days");
  const s = await loadPaymentSettings();
  return { wallets: s.wallets.filter((w) => w.active) };
}

export async function savePaymentSettings(next: PaymentSettings, by: string) {
  await connectMongoose();
  const before = await loadPaymentSettings();
  const clean = readPaymentSettings(next);
  await Setting.updateOne({ _id: KEY }, { $set: { value: clean, updatedBy: by } }, { upsert: true });
  return { before, after: clean };
}

/**
 * Whether a TrxID is already on an order (FR-CO-05). Orders arrive in Phase 2.7, which also adds a
 * unique index on advance.trxId so two orders placed at the same moment can't share one.
 */
export async function isTrxIdUsed(trxId: string): Promise<boolean> {
  const m = await connectMongoose();
  const db = m.connection.db;
  if (!db) return false;
  return (await db.collection("orders").countDocuments({ "advance.trxId": trxId }, { limit: 1 })) > 0;
}
