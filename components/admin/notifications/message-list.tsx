"use client";

import { Mail, MessageSquare, RotateCw } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { report } from "@/components/admin/catalog/form-bits";
import { dhakaTime } from "@/components/admin/orders/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resendNotificationAction } from "@/modules/notifications/actions";
import type { LogRow } from "@/modules/notifications/data";
import { NOTIFICATION_STATUS_NAMES, purposeName, type NotificationStatus } from "@/modules/notifications/templates";

const STATUS_STYLE: Record<NotificationStatus, string> = {
  queued: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  sent: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300",
};

/** Shown as 01XXXXXXXXX. */
const showTo = (to: string) => to.replace(/^\+88/, "");

function statusLabel(r: LogRow) {
  if (r.status === "queued" && r.attempts > 0) return `Retrying (${r.attempts} tried)`;
  return NOTIFICATION_STATUS_NAMES[r.status];
}

/** Messages from the log (FR-OR-07), newest first, with "Send again" for failed and sent ones. */
export function MessageList({
  rows,
  now,
  canResend,
  showOrder = true,
}: {
  rows: LogRow[];
  now: number;
  canResend: boolean;
  showOrder?: boolean;
}) {
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">No messages yet.</p>;
  return (
    <ul className="min-w-0 divide-y rounded-md border">
      {rows.map((r) => (
        <MessageRow key={r.id} row={r} now={now} canResend={canResend} showOrder={showOrder} />
      ))}
    </ul>
  );
}

function MessageRow({
  row: r,
  now,
  canResend,
  showOrder,
}: {
  row: LogRow;
  now: number;
  canResend: boolean;
  showOrder: boolean;
}) {
  const [pending, start] = useTransition();
  const Icon = r.channel === "sms" ? MessageSquare : Mail;
  const mayResend = canResend && !r.private && r.status !== "queued";
  return (
    <li className="grid gap-1.5 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Icon className="text-muted-foreground size-4 shrink-0" aria-label={r.channel === "sms" ? "SMS" : "Email"} />
        <span className="font-medium">{purposeName(r.purpose)}</span>
        <span className="text-muted-foreground break-all">→ {showTo(r.to)}</span>
        {showOrder && r.orderNo && (
          <Link href={`/admin/orders/${r.orderNo}`} className="underline underline-offset-2">
            {r.orderNo}
          </Link>
        )}
        <Badge variant="outline" className={cn("ml-auto whitespace-nowrap", STATUS_STYLE[r.status])}>
          {statusLabel(r)}
        </Badge>
      </div>
      {r.private ? (
        <p className="text-muted-foreground text-xs italic">
          Contains a code or sign-in link, so the text isn&apos;t kept.
        </p>
      ) : (
        <details className="group">
          <summary className="text-muted-foreground cursor-pointer list-none text-xs group-open:hidden">
            <span className="line-clamp-2 [overflow-wrap:anywhere] whitespace-pre-line">
              {r.subject ? `${r.subject}: ${r.text}` : r.text}
            </span>
          </summary>
          {r.subject && <p className="font-medium [overflow-wrap:anywhere]">{r.subject}</p>}
          <p className="text-muted-foreground mt-1 text-xs [overflow-wrap:anywhere] whitespace-pre-line">{r.text}</p>
        </details>
      )}
      {r.error && (
        <p
          className={cn(
            "text-xs [overflow-wrap:anywhere]",
            r.status === "failed" ? "text-red-700 dark:text-red-300" : "text-muted-foreground",
          )}
        >
          {r.status === "failed" ? "Error: " : "Last error: "}
          {r.error}
        </p>
      )}
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span>Queued {dhakaTime(r.createdAt, now)}</span>
        {r.sentAt && <span>Sent {dhakaTime(r.sentAt, now)}</span>}
        {r.provider && <span>via {r.provider}</span>}
        {r.resends > 0 && <span>Sent again {r.resends}×</span>}
        {mayResend && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7"
            disabled={pending}
            onClick={() => start(async () => void report(await resendNotificationAction({ id: r.id })))}
          >
            <RotateCw className="size-3.5" aria-hidden /> {pending ? "Queuing…" : "Send again"}
          </Button>
        )}
      </div>
    </li>
  );
}
