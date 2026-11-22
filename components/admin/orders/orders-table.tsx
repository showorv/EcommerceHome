"use client";

import { Phone } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { selectClass } from "@/components/admin/catalog/form-bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTaka } from "@/lib/money";
import { PAYMENT_METHOD_NAMES } from "@/modules/checkout/checkout";
import { bulkCancelAction, bulkConfirmAction, bulkMoveAction, type BulkResult } from "@/modules/orders/admin-actions";
import { canMove } from "@/modules/orders/lifecycle";
import type { OrderStatus } from "@/modules/orders/orders";
import { CALL_OUTCOME_NAMES, CANCEL_REASONS, type OrderRow } from "@/modules/orders/staff";
import { ago, dhakaTime, PaymentBadge, RiskBadge, showPhone, StatusBadge, telHref } from "./bits";

type Skipped = { orderNo: string; why: string }[];
export type BulkKind = "confirm" | "cancel" | "packed" | "shipped" | "delivered";

const BULK_TARGET: Record<BulkKind, OrderStatus> = {
  confirm: "confirmed",
  cancel: "cancelled",
  packed: "packed",
  shipped: "shipped",
  delivered: "delivered",
};
const BULK_BUTTON: Record<Exclude<BulkKind, "cancel">, string> = {
  confirm: "Confirm",
  packed: "Mark packed",
  shipped: "Mark shipped",
  delivered: "Mark delivered",
};

export function OrdersTable({
  rows,
  now,
  showStatus,
  actions,
}: {
  rows: OrderRow[];
  now: number;
  showStatus: boolean;
  /** The bulk moves offered here (by tab and permission). */
  actions: readonly BulkKind[];
}) {
  const selectable = rows.filter((r) => actions.some((a) => canMove(r.status, BULK_TARGET[a]))).map((r) => r.orderNo);
  const bulk = actions.length > 0 && selectable.length > 0;
  const mayCancel = actions.includes("cancel");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [skipped, setSkipped] = useState<Skipped>([]);
  const [pending, start] = useTransition();

  // Only orders still on this page and still selectable count (the list refreshes after each action).
  const chosen = selectable.filter((n) => picked.has(n));
  const all = chosen.length === selectable.length;
  const toggle = (n: string, on: boolean) =>
    setPicked((s) => {
      const next = new Set(s);
      if (on) next.add(n);
      else next.delete(n);
      return next;
    });

  function done(res: BulkResult) {
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.done.length > 0) toast.success(res.message);
    else toast.error(res.message);
    setSkipped(res.skipped);
    setPicked(new Set(res.skipped.map((s) => s.orderNo)));
  }

  function moveAll(kind: Exclude<BulkKind, "cancel">) {
    start(async () =>
      done(
        kind === "confirm"
          ? await bulkConfirmAction({ orderNos: chosen })
          : await bulkMoveAction({ orderNos: chosen, to: kind }),
      ),
    );
  }

  function cancelAll() {
    start(async () => {
      const res = await bulkCancelAction({ orderNos: chosen, reason, note });
      done(res);
      if (res.ok) {
        setCancelling(false);
        setReason("");
        setNote("");
      }
    });
  }

  return (
    <div className="grid gap-3">
      {bulk && chosen.length > 0 && (
        <div className="bg-muted/60 sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
          <span className="px-1 font-medium">{chosen.length} selected</span>
          {actions
            .filter((a): a is Exclude<BulkKind, "cancel"> => a !== "cancel")
            .map((a) => (
              <Button key={a} size="sm" onClick={() => moveAll(a)} disabled={pending}>
                {pending ? "Working…" : BULK_BUTTON[a]}
              </Button>
            ))}
          {mayCancel && (
            <Button size="sm" variant="outline" onClick={() => setCancelling(true)} disabled={pending}>
              Cancel orders…
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
            Clear
          </Button>
          {actions.includes("confirm") && (
            <span className="text-muted-foreground text-xs">
              Orders with an advance to check are confirmed one by one.
            </span>
          )}
        </div>
      )}

      {skipped.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="status">
          <p className="font-medium">Not changed:</p>
          <ul className="mt-1 list-disc pl-5">
            {skipped.map((s) => (
              <li key={s.orderNo}>
                <Link href={`/admin/orders/${s.orderNo}`} className="underline underline-offset-2">
                  {s.orderNo}
                </Link>
                : {s.why}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {bulk && (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all orders on this page"
                    checked={chosen.length === 0 ? false : all ? true : "indeterminate"}
                    onCheckedChange={(v) => setPicked(v === true ? new Set(selectable) : new Set())}
                  />
                </TableHead>
              )}
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Area</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Last call</TableHead>
              {showStatus && <TableHead>Status</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-state={picked.has(r.orderNo) ? "selected" : undefined}>
                {bulk && (
                  <TableCell>
                    {selectable.includes(r.orderNo) && (
                      <Checkbox
                        aria-label={`Select ${r.orderNo}`}
                        checked={picked.has(r.orderNo)}
                        onCheckedChange={(v) => toggle(r.orderNo, v === true)}
                      />
                    )}
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap">
                  <Link href={`/admin/orders/${r.orderNo}`} className="font-medium hover:underline">
                    {r.orderNo}
                  </Link>
                  <div className="text-muted-foreground text-xs">
                    {r.status === "pending" ? `Waiting ${ago(r.createdAt, now)}` : dhakaTime(r.createdAt, now)}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <div className="max-w-44 truncate">{r.name}</div>
                  <a
                    href={telHref(r.phone)}
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs tabular-nums"
                    aria-label={`Call ${r.name} on ${showPhone(r.phone)}`}
                  >
                    <Phone className="size-3" aria-hidden />
                    {showPhone(r.phone)}
                  </a>
                </TableCell>
                <TableCell>
                  <div className="max-w-40 truncate text-sm">{r.area}</div>
                  <div className="text-muted-foreground text-xs">{r.zoneName}</div>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {formatTaka(r.total)}
                  <div className="text-muted-foreground text-xs">
                    {r.itemCount} item{r.itemCount === 1 ? "" : "s"}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <div className="text-sm">{PAYMENT_METHOD_NAMES[r.paymentMethod] ?? r.paymentMethod}</div>
                  {r.paymentStatus !== "unpaid" && <PaymentBadge status={r.paymentStatus} />}
                </TableCell>
                <TableCell>
                  <RiskBadge level={r.riskLevel} score={r.riskScore} />
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {r.lastCall ? (
                    <>
                      {CALL_OUTCOME_NAMES[r.lastCall.outcome]}
                      <div className="text-muted-foreground text-xs">{ago(r.lastCall.at, now)} ago</div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Not called</span>
                  )}
                </TableCell>
                {showStatus && (
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={cancelling} onOpenChange={(o) => !pending && setCancelling(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Cancel {chosen.length} order{chosen.length === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>
              Their items go back on sale (held or already taken from stock). The reason is saved on each order.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-cancel-reason">Reason</Label>
              <select
                id="bulk-cancel-reason"
                className={selectClass}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">Choose a reason</option>
                {CANCEL_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-cancel-note">Note (optional)</Label>
              <Input id="bulk-cancel-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelling(false)} disabled={pending}>
              Keep them
            </Button>
            <Button variant="destructive" onClick={cancelAll} disabled={pending || !reason}>
              {pending ? "Cancelling…" : "Cancel orders"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
