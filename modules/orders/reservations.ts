import mongoose from "mongoose";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { syncProductFromVariants } from "@/modules/catalog/listing-sync";
import { Variant } from "@/modules/catalog/models";
import { Order } from "./models";

/**
 * Stock held by orders that weren't confirmed in time goes back on sale (FR-CO-07). The worker runs
 * this every few minutes. The order itself stays where it is (staff can still confirm it: confirming
 * takes the units then, if they are still free); its history says the hold ended. Not marked server-only: worker code.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

export const RESERVATION_NOTE = "Stock hold ended: not confirmed in time";

export async function releaseExpiredReservations(
  now = new Date(),
  limit = 100,
): Promise<{ orderNos: string[]; productIds: string[] }> {
  await connectMongoose();
  const due = await Order.find(trustFilter({ "reservation.active": true, "reservation.until": { $lte: now } }))
    .select("orderNo status items")
    .sort({ "reservation.until": 1 })
    .limit(limit)
    .lean<AnyDoc[]>();

  const orderNos: string[] = [];
  const productIds = new Set<string>();
  for (const d of due) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Only one run releases an order, even if two overlap.
        const res = await Order.updateOne(
          { _id: d._id, "reservation.active": true },
          {
            $set: { "reservation.active": false, "reservation.releasedAt": now },
            $push: { statusHistory: { status: d.status, at: now, by: null, note: RESERVATION_NOTE } },
          },
          { session },
        );
        if (res.modifiedCount !== 1) return;
        for (const i of (d.items ?? []) as AnyDoc[]) await giveBack(String(i.variantId), Number(i.qty), session);
        const products = [...new Set(((d.items ?? []) as AnyDoc[]).map((i) => String(i.productId)))];
        for (const p of products) {
          await syncProductFromVariants(p, session);
          productIds.add(p);
        }
        orderNos.push(String(d.orderNo));
      });
    } finally {
      await session.endSession();
    }
  }
  return { orderNos, productIds: [...productIds] };
}

/** Takes `qty` off the variant's held count, never below 0 (a hand correction may have lowered it). */
export async function giveBack(variantId: string, qty: number, session: mongoose.ClientSession) {
  const _id = new mongoose.Types.ObjectId(variantId);
  const res = await Variant.updateOne(
    trustFilter({ _id, reserved: { $gte: qty } }),
    { $inc: { reserved: -qty } },
    { session },
  );
  if (res.matchedCount === 0) {
    await Variant.updateOne(trustFilter({ _id, reserved: { $lt: qty } }), { $set: { reserved: 0 } }, { session });
  }
}
