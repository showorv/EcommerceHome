import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { MessageCard } from "@/components/admin/cms/message-card";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/modules/auth/session";
import { countOpenMessages, listMessages } from "@/modules/cms/messages";

export const metadata: Metadata = { title: "Messages" };

// Checks the signed-in staff member on every request (see app/admin/layout.tsx).
export const instant = false;

/** Messages sent from the Contact page (FR-SF-09). Cursor pagination by _id, newest first. */
export default async function MessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  await requireStaff("customers.view");
  const sp = await searchParams;
  const view = sp.view === "handled" ? "handled" : "open";
  const before = typeof sp.before === "string" ? sp.before : undefined;
  const [{ rows, next }, open] = await Promise.all([listMessages(view, before), countOpenMessages()]);

  const tab = (v: "open" | "handled", label: string) => (
    <Link
      href={v === "open" ? "/admin/messages" : "/admin/messages?view=handled"}
      aria-current={view === v ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium",
        view === v ? "bg-secondary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader
        title="Messages"
        description="Sent by shoppers from the contact form. Mark each one done once you’ve replied."
      />
      <nav className="flex w-fit gap-1 rounded-lg border p-1" aria-label="Messages">
        {tab("open", `To answer (${open})`)}
        {tab("handled", "Done")}
      </nav>
      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          {view === "open" ? "Nothing to answer. New messages appear here." : "No answered messages yet."}
        </p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((m) => (
            <li key={m.id}>
              <MessageCard message={m} />
            </li>
          ))}
        </ul>
      )}
      {(before || next) && (
        <div className="flex gap-3 text-sm">
          {before && (
            <Link
              href={view === "open" ? "/admin/messages" : "/admin/messages?view=handled"}
              className="hover:underline"
            >
              ← Newest
            </Link>
          )}
          {next && (
            <Link
              href={`/admin/messages?${view === "handled" ? "view=handled&" : ""}before=${next}`}
              className="hover:underline"
            >
              Older →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
