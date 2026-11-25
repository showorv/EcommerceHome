import { connectMongoose } from "@/lib/db/mongo";
import { Notification } from "./models";

/** The worker's notes on the message log after each try (FR-OR-07). Not server-only: worker code. */

export async function markSent(logId: string, res: { provider: string; providerMessageId: string }) {
  await connectMongoose();
  await Notification.updateOne(
    { _id: logId },
    {
      $set: {
        status: "sent",
        provider: res.provider,
        providerMessageId: res.providerMessageId,
        sentAt: new Date(),
        error: null,
      },
      $inc: { attempts: 1 },
    },
  );
}

/** A try failed: still "queued" while the queue will try again, "failed" after the last try. */
export async function markTryFailed(logId: string, error: string, final: boolean) {
  await connectMongoose();
  await Notification.updateOne(
    { _id: logId },
    { $set: { error: error.slice(0, 500), ...(final ? { status: "failed" } : {}) }, $inc: { attempts: 1 } },
  );
}
