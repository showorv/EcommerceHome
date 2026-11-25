import mongoose, { type ClientSession } from "mongoose";
import { mongoDb } from "@/lib/db/mongo";

/**
 * Sequential numbers that never collide under load (SRS §7 "counters"):
 * one atomic $inc per call, safe across many app servers.
 * Used for order numbers (SR10234) and invoice numbers (INV-2026-000123).
 */
type CounterDoc = { _id: string; seq: number };

export async function nextSequence(name: string, startAt = 1): Promise<number> {
  const res = await mongoDb()
    .collection<CounterDoc>("counters")
    .findOneAndUpdate({ _id: name }, [{ $set: { seq: { $add: [{ $ifNull: ["$seq", startAt - 1] }, 1] } } }], {
      upsert: true,
      returnDocument: "after",
    });
  if (!res) throw new Error(`Counter ${name} could not be incremented`);
  return res.seq;
}

/** Formats e.g. formatSequence("INV-2026-", 123, 6) → "INV-2026-000123". */
export function formatSequence(prefix: string, seq: number, pad = 0): string {
  return prefix + String(seq).padStart(pad, "0");
}

/**
 * The next number inside a Mongoose transaction: if the transaction fails, the number is given back,
 * so order numbers have no gaps. Orders taken at the same moment wait for each other here (the
 * transaction retries), which is fine at shop volumes (NFR-SC-07).
 */
export async function nextSequenceInSession(session: ClientSession, name: string, startAt = 1): Promise<number> {
  const res = await mongoose.connection
    .collection<CounterDoc>("counters")
    .findOneAndUpdate({ _id: name }, [{ $set: { seq: { $add: [{ $ifNull: ["$seq", startAt - 1] }, 1] } } }], {
      upsert: true,
      returnDocument: "after",
      session,
    });
  if (!res) throw new Error(`Counter ${name} could not be incremented`);
  return res.seq;
}
