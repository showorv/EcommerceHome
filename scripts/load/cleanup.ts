/**
 * Removes everything a load test made (see prepare.ts): its orders, their messages and queued jobs,
 * the guest carts, stock records, rate-limit counters, the order number counter (if it didn't exist
 * before) and the temporary product. Only records tied to the test product or test phone numbers are
 * touched.
 *
 *   pnpm load:cleanup
 */
import "../../worker/load-env";
import { readFileSync, rmSync } from "node:fs";
import mongoose from "mongoose";
import { connectMongoose } from "@/lib/db/mongo";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";
import { redis } from "@/lib/redis";

type Run = {
  startedAt: string;
  hadOrderCounter: boolean;
  productId: string;
  variantId: string;
  phones: { local: string }[];
};

async function main() {
  const run = JSON.parse(readFileSync(".loadtest/run.json", "utf8")) as Run;
  await connectMongoose();
  const db = mongoose.connection.db!;
  const since = new Date(run.startedAt);
  const productId = new mongoose.Types.ObjectId(run.productId);
  const variantId = new mongoose.Types.ObjectId(run.variantId);
  const phones = run.phones.map((p) => `+88${p.local}`);

  const orders = await db
    .collection("orders")
    .find({ createdAt: { $gte: since }, "customer.phone": { $in: phones } }, { projection: { _id: 1, orderNo: 1 } })
    .toArray();
  const orderIds = orders.map((o) => String(o._id));
  const notes = await db
    .collection("notifications")
    .find({ orderId: { $in: orderIds } }, { projection: { _id: 1 } })
    .toArray();
  const noteIds = new Set(notes.map((n) => String(n._id)));

  // Queued messages for those orders (the worker may not be running).
  const queue = getQueue(QUEUE_NAMES.notifications);
  let jobs = 0;
  for (const job of await queue.getJobs(["wait", "delayed", "failed", "completed", "active"])) {
    const d = (job?.data ?? {}) as { logId?: string; to?: string };
    if ((d.logId && noteIds.has(String(d.logId))) || (d.to && phones.includes(d.to))) {
      await job.remove().catch(() => undefined);
      jobs++;
    }
  }
  await queue.close();

  const r = {
    orders: (await db.collection("orders").deleteMany({ _id: { $in: orders.map((o) => o._id) } })).deletedCount,
    notifications: (await db.collection("notifications").deleteMany({ orderId: { $in: orderIds } })).deletedCount,
    audits: (await db.collection("auditLogs").deleteMany({ createdAt: { $gte: since }, entityId: { $in: orderIds } }))
      .deletedCount,
    // Guest carts made during the run: those still holding the test product, and those emptied by
    // placing an order (a guest cart is created on the first add, so an empty one is the test's).
    carts: (
      await db.collection("carts").deleteMany({
        createdAt: { $gte: since },
        userId: null,
        $or: [{ "items.variantId": { $in: [run.variantId, variantId] } }, { items: { $size: 0 } }],
      })
    ).deletedCount,
    movements: (await db.collection("inventoryMovements").deleteMany({ variantId })).deletedCount,
    variants: (await db.collection("variants").deleteMany({ _id: variantId })).deletedCount,
    products: (await db.collection("products").deleteMany({ _id: productId })).deletedCount,
    counter: run.hadOrderCounter
      ? 0
      : (await db.collection("counters").deleteMany({ _id: "orderNo" as never })).deletedCount,
  };

  // Rate-limit counters for the test's addresses and numbers.
  const rd = redis();
  let keys = 0;
  const block = run.phones[0]!.local.slice(1, 8); // "130" + the run's 4-digit block
  for (const pattern of ["*10.77.*", `*${block}*`]) {
    for await (const batch of rd.scanStream({ match: pattern, count: 500 })) {
      for (const k of batch as string[]) keys += await rd.del(k);
    }
  }
  rd.disconnect();

  console.log({ ...r, queuedJobs: jobs, redisKeys: keys });
  rmSync(".loadtest", { recursive: true, force: true });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
