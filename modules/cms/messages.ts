import "server-only";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { ContactMessage } from "./models";

/** Messages from the Contact page form, newest first (FR-SF-09). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

export type ContactMessageRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  message: string;
  page: string;
  createdAt: string;
  handledAt: string | null;
};

export const MESSAGES_PAGE_SIZE = 50;

export async function listMessages(view: "open" | "handled", before?: string) {
  await connectMongoose();
  const filter: Record<string, unknown> = view === "open" ? { handledAt: null } : { handledAt: { $ne: null } };
  if (before && /^[a-f0-9]{24}$/i.test(before)) filter._id = { $lt: before };
  const docs = await ContactMessage.find(trustFilter(filter))
    .sort({ _id: -1 })
    .limit(MESSAGES_PAGE_SIZE + 1)
    .lean<AnyDoc[]>();
  const rows: ContactMessageRow[] = docs.slice(0, MESSAGES_PAGE_SIZE).map((d) => ({
    id: String(d._id),
    name: String(d.name),
    phone: String(d.phone ?? ""),
    email: String(d.email ?? ""),
    message: String(d.message),
    page: String(d.page ?? ""),
    createdAt: new Date(d.createdAt).toISOString(),
    handledAt: d.handledAt ? new Date(d.handledAt).toISOString() : null,
  }));
  return { rows, next: docs.length > MESSAGES_PAGE_SIZE ? rows[rows.length - 1]!.id : null };
}

export async function countOpenMessages(): Promise<number> {
  await connectMongoose();
  return ContactMessage.countDocuments({ handledAt: null });
}
