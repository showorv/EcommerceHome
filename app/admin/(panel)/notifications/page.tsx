import { Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { MessageList } from "@/components/admin/notifications/message-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/modules/auth/session";
import { listNotifications, LOG_PAGE_SIZE, readLogFilters, type LogFilters } from "@/modules/notifications/data";
import {
  CHANNEL_NAMES,
  CHANNELS,
  NOTIFICATION_STATUS_NAMES,
  NOTIFICATION_STATUSES,
} from "@/modules/notifications/templates";
import { requestTime } from "@/modules/orders/admin-data";

export const metadata: Metadata = { title: "Notifications" };

// Reads the signed-in staff member and the URL filters on every request.
export const instant = false;

const selectClass = "bg-background h-9 rounded-md border px-2 text-sm";

function query(f: LogFilters, page = 1) {
  const p = new URLSearchParams();
  if (f.status !== "all") p.set("status", f.status);
  if (f.channel !== "all") p.set("channel", f.channel);
  if (f.q) p.set("q", f.q);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default async function NotificationsPage({ searchParams }: PageProps<"/admin/notifications">) {
  const { permissions } = await requireStaff("orders.view");
  const f = readLogFilters(await searchParams);
  const [{ rows, total, failed }, now] = await Promise.all([listNotifications(f), requestTime()]);
  const pages = Math.max(1, Math.ceil(total / LOG_PAGE_SIZE));
  const tabs = [
    { key: "all" as const, label: "All" },
    ...NOTIFICATION_STATUSES.map((s) => ({ key: s, label: NOTIFICATION_STATUS_NAMES[s] })),
  ];

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Notifications"
        description="Every SMS and email the shop sends. A failed send is tried again on its own, 5 times over about a minute and a half; after that you can send it again here."
        actions={
          permissions.has("settings.manage") && (
            <Button asChild variant="outline">
              <Link href="/admin/notifications/templates">
                <Settings2 className="size-4" aria-hidden /> Message texts
              </Link>
            </Button>
          )
        }
      />
      {failed > 0 && f.status !== "failed" && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">
          {failed} message{failed === 1 ? "" : "s"} failed in the last 7 days.{" "}
          <Link
            href={`/admin/notifications${query({ ...f, status: "failed" })}`}
            className="font-medium underline underline-offset-2"
          >
            Show failed
          </Link>
        </p>
      )}

      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Message status">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin/notifications${query({ ...f, status: t.key })}`}
            aria-current={f.status === t.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
              f.status === t.key
                ? "border-primary font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <form className="flex flex-wrap items-center gap-2" action="/admin/notifications">
        {f.status !== "all" && <input type="hidden" name="status" value={f.status} />}
        <Input
          name="q"
          defaultValue={f.q}
          placeholder="Phone, email or order number"
          className="h-9 w-full sm:w-72"
          aria-label="Search messages"
        />
        <select name="channel" defaultValue={f.channel} className={selectClass} aria-label="Channel">
          <option value="all">SMS and email</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_NAMES[c]}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm" className="h-9">
          Search
        </Button>
        {(f.q || f.channel !== "all") && (
          <Button asChild variant="ghost" size="sm" className="h-9">
            <Link href={`/admin/notifications${query({ ...f, q: "", channel: "all" })}`}>Clear</Link>
          </Button>
        )}
        <span className="text-muted-foreground ml-auto text-sm tabular-nums">
          {total} message{total === 1 ? "" : "s"}
        </span>
      </form>

      <MessageList rows={rows} now={now} canResend={permissions.has("orders.update")} />

      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          {f.page > 1 ? (
            <Link href={`/admin/notifications${query(f, f.page - 1)}`} className="underline underline-offset-2">
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Page {f.page} of {pages}
          </span>
          {f.page < pages ? (
            <Link href={`/admin/notifications${query(f, f.page + 1)}`} className="underline underline-offset-2">
              Older
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
