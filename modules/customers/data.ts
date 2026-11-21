import "server-only";
import { connectMongoose } from "@/lib/db/mongo";
import type { BlockedContact as Row, BlockInput, BlockKind } from "./blocks";
import { BlockedContact } from "./models";

/** Blocked and flagged numbers. Admin callers check customers.block and write the audit log. */

export class BlockError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

const toRow = (d: AnyDoc): Row => ({
  id: String(d._id),
  phone: String(d.phone),
  kind: d.kind as BlockKind,
  reason: String(d.reason ?? ""),
  byName: String(d.byName ?? ""),
  createdAt: new Date(d.createdAt).toISOString(),
});

export async function listBlocked(): Promise<Row[]> {
  await connectMongoose();
  const docs = await BlockedContact.find().sort({ createdAt: -1 }).limit(1000).lean<AnyDoc[]>();
  return docs.map(toRow);
}

export async function addBlocked(input: BlockInput, by: { id: string; name: string }): Promise<Row> {
  await connectMongoose();
  try {
    const d = await BlockedContact.create({ ...input, byUserId: by.id, byName: by.name });
    return toRow(d.toObject());
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new BlockError("This number is already on the list. Change or remove that entry instead.");
    }
    throw err;
  }
}

export async function updateBlocked(id: string, patch: { kind: BlockKind; reason: string }) {
  await connectMongoose();
  const before = await BlockedContact.findById(id).lean<AnyDoc>();
  if (!before) throw new BlockError("This entry no longer exists.");
  await BlockedContact.updateOne({ _id: id }, { $set: patch });
  return { before: toRow(before), after: { ...toRow(before), ...patch } };
}

export async function removeBlocked(id: string): Promise<Row> {
  await connectMongoose();
  const d = await BlockedContact.findOneAndDelete({ _id: id }).lean<AnyDoc>();
  if (!d) throw new BlockError("This entry no longer exists.");
  return toRow(d);
}

/** The entry for this number, if staff blocked or flagged it. */
export async function blockFor(phone: string): Promise<{ kind: BlockKind; reason: string } | null> {
  await connectMongoose();
  const d = await BlockedContact.findOne({ phone }).select("kind reason").lean<AnyDoc>();
  return d ? { kind: d.kind as BlockKind, reason: String(d.reason ?? "") } : null;
}
