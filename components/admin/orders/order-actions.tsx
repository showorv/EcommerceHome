"use client";

import { Check, Package, PackageCheck, PackageMinus, Pause, Phone, Truck, Undo2, X } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { report, selectClass } from "@/components/admin/catalog/form-bits";
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
import { formatTaka } from "@/lib/money";
import { WALLET_NAMES } from "@/modules/payments/payments";
import {
  cancelOrderAction,
  confirmOrderAction,
  holdOrderAction,
  moveOrderAction,
  partlyDeliverOrderAction,
  returnOrderAction,
} from "@/modules/orders/admin-actions";
import { canMove, MOVE_NAMES, RETURN_REASONS, stockCommitted, type SimpleMove } from "@/modules/orders/lifecycle";
import type { OrderStatus } from "@/modules/orders/orders";
import { CANCEL_REASONS, needsAdvanceCheck, type AdminOrder } from "@/modules/orders/staff";

type Props = {
  order: Pick<AdminOrder, "orderNo" | "rev" | "status" | "advance" | "total" | "codAmount" | "items">;
  may: { confirm: boolean; update: boolean; cancel: boolean };
};

type Open = OrderStatus | null;
type Result = { ok: true; message: string } | { ok: false; error: string };

const ICONS: Partial<Record<OrderStatus, ReactNode>> = {
  confirmed: <Check className="size-4" aria-hidden />,
  pending: <Phone className="size-4" aria-hidden />,
  on_hold: <Pause className="size-4" aria-hidden />,
  packed: <Package className="size-4" aria-hidden />,
  shipped: <Truck className="size-4" aria-hidden />,
  delivered: <PackageCheck className="size-4" aria-hidden />,
  partially_delivered: <PackageMinus className="size-4" aria-hidden />,
  returned: <Undo2 className="size-4" aria-hidden />,
  cancelled: <X className="size-4" aria-hidden />,
};

/** The main move first, the rest as outline buttons. */
const ORDER: OrderStatus[] = [
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "partially_delivered",
  "pending",
  "on_hold",
  "returned",
  "cancelled",
];

const SIMPLE_TEXT: Record<SimpleMove, { title: string; body: string; button: string }> = {
  pending: {
    title: "Back to To call",
    body: "The order goes back into the call queue.",
    button: "Move back",
  },
  packed: {
    title: "Mark packed",
    body: "The parcel is packed and ready for the courier.",
    button: "Mark packed",
  },
  shipped: {
    title: "Mark shipped",
    body: "The courier has the parcel.",
    button: "Mark shipped",
  },
  delivered: {
    title: "Mark delivered",
    body: "The customer received everything and the courier collected the cash. The order counts as paid.",
    button: "Mark delivered",
  },
};

const SIMPLE: readonly OrderStatus[] = ["pending", "packed", "shipped", "delivered"];
const isSimple = (s: OrderStatus): s is SimpleMove => SIMPLE.includes(s);

/**
 * The moves this order allows (FR-OR-01), each with its own short dialog. The server checks the move
 * again, so a stale page can't push an order where it shouldn't go.
 */
export function OrderActions({ order, may }: Props) {
  const [open, setOpen] = useState<Open>(null);
  const [checked, setChecked] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [back, setBack] = useState<Record<string, string>>({});
  const [collected, setCollected] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const advance = order.advance;
  const mustCheck = needsAdvanceCheck(order);
  const committed = stockCommitted(order.status);

  const allowed = (to: OrderStatus) => {
    if (!canMove(order.status, to)) return false;
    if (to === "confirmed") return may.confirm;
    if (to === "cancelled") return may.cancel;
    return may.update;
  };
  const moves = ORDER.filter(allowed);
  if (moves.length === 0) return null;

  function reset() {
    setOpen(null);
    setChecked(false);
    setReason("");
    setNote("");
    setBack({});
    setCollected(null);
  }
  const close = () => !pending && reset();
  const send = (work: () => Promise<Result>) =>
    start(async () => {
      if (report(await work())) reset();
    });

  const base = { orderNo: order.orderNo, rev: order.rev };

  // Partly delivered: the suggested amount is the door amount less what came back.
  const backValue = order.items.reduce((n, i) => n + i.price * Math.min(i.qty, Number(back[i.variantId]) || 0), 0);
  const suggested = Math.max(0, order.codAmount - backValue);
  const collectedText = collected ?? String(suggested / 100);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {moves.map((to, i) => (
          <Button
            key={to}
            variant={i === 0 && to !== "cancelled" && to !== "returned" ? "default" : "outline"}
            onClick={() => {
              if (to === "returned" && order.status === "delivered") setReason("Customer returned it after delivery");
              setOpen(to);
            }}
          >
            {ICONS[to]} {MOVE_NAMES[to]}
          </Button>
        ))}
      </div>

      <Dialog open={open === "confirmed"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm {order.orderNo}</DialogTitle>
            <DialogDescription>
              The items leave stock for good and the customer gets an SMS: total {formatTaka(order.total)}
              {order.codAmount !== order.total && `, ${formatTaka(order.codAmount)} to pay at the door`}.
            </DialogDescription>
          </DialogHeader>
          {mustCheck && advance && (
            <div className="grid gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p>Find this payment in your {WALLET_NAMES[advance.method]} statement before confirming:</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">TrxID</dt>
                <dd className="font-mono font-medium">{advance.trxId}</dd>
                <dt className="text-muted-foreground">Amount</dt>
                <dd className="font-medium">{formatTaka(advance.amount)}</dd>
                <dt className="text-muted-foreground">From</dt>
                <dd className="font-mono">{advance.senderNumber.replace(/^\+88/, "")}</dd>
              </dl>
              <div className="flex items-start gap-2">
                <Checkbox id="advance-checked" checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
                <Label htmlFor="advance-checked" className="leading-snug font-normal">
                  I found this TrxID and amount in the statement
                </Label>
              </div>
            </div>
          )}
          <NoteField
            id="confirm-note"
            value={note}
            onChange={setNote}
            placeholder="e.g. Confirmed by phone, deliver after 5 pm"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={close} disabled={pending}>
              Not yet
            </Button>
            <Button
              disabled={pending || (mustCheck && !checked)}
              onClick={() => send(() => confirmOrderAction({ ...base, advanceChecked: checked, note }))}
            >
              {pending ? "Confirming…" : "Confirm order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "on_hold"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Put {order.orderNo} on hold</DialogTitle>
            <DialogDescription>
              For orders waiting on the customer. The stock stays held until the hold time ends.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="hold-note">Why</Label>
            <Input
              id="hold-note"
              maxLength={500}
              placeholder="e.g. Asked us to call back tomorrow morning"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={close} disabled={pending}>
              Back
            </Button>
            <Button disabled={pending || !note.trim()} onClick={() => send(() => holdOrderAction({ ...base, note }))}>
              {pending ? "Saving…" : "Put on hold"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {open && isSimple(open) && (
        <Dialog open onOpenChange={(o) => !o && close()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {SIMPLE_TEXT[open].title}: {order.orderNo}
              </DialogTitle>
              <DialogDescription>
                {SIMPLE_TEXT[open].body}
                {open === "delivered" && order.codAmount > 0 && ` Collected: ${formatTaka(order.codAmount)}.`}
              </DialogDescription>
            </DialogHeader>
            <NoteField id="move-note" value={note} onChange={setNote} />
            <DialogFooter>
              <Button variant="ghost" onClick={close} disabled={pending}>
                Back
              </Button>
              <Button disabled={pending} onClick={() => send(() => moveOrderAction({ ...base, to: open, note }))}>
                {pending ? "Saving…" : SIMPLE_TEXT[open].button}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={open === "partially_delivered"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Partly delivered: {order.orderNo}</DialogTitle>
            <DialogDescription>Enter the units the courier brought back. They go back into stock.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <ul className="grid gap-2">
              {order.items.map((i) => (
                <li key={i.variantId} className="flex items-center justify-between gap-3 text-sm">
                  <label htmlFor={`back-${i.variantId}`} className="min-w-0">
                    <span className="block truncate">
                      {i.variantTitle ? `${i.title} (${i.variantTitle})` : i.title}
                    </span>
                    <span className="text-muted-foreground text-xs">Sent: {i.qty}</span>
                  </label>
                  <Input
                    id={`back-${i.variantId}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={i.qty}
                    className="w-20"
                    aria-label={`Units of ${i.title} that came back`}
                    value={back[i.variantId] ?? "0"}
                    onChange={(e) => setBack((b) => ({ ...b, [i.variantId]: e.target.value }))}
                  />
                </li>
              ))}
            </ul>
            <div className="grid gap-1.5">
              <Label htmlFor="collected">Collected at the door (৳)</Label>
              <Input
                id="collected"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={collectedText}
                onChange={(e) => setCollected(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Suggested: {formatTaka(suggested)} (the door amount less the units that came back). Use what the courier
                actually collected.
              </p>
            </div>
            <NoteField id="partial-note" value={note} onChange={setNote} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={close} disabled={pending}>
              Back
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                send(() =>
                  partlyDeliverOrderAction({
                    ...base,
                    returned: order.items.map((i) => ({ variantId: i.variantId, qty: back[i.variantId] || "0" })),
                    collected: collectedText,
                    note,
                  }),
                )
              }
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "returned"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Returned: {order.orderNo}</DialogTitle>
            <DialogDescription>
              Every unit goes back into stock.
              {order.status === "delivered" && " If the customer paid, refund them from the Payment card afterwards."}
            </DialogDescription>
          </DialogHeader>
          <ReasonFields
            id="return"
            reasons={RETURN_REASONS}
            reason={reason}
            setReason={setReason}
            note={note}
            setNote={setNote}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={close} disabled={pending}>
              Back
            </Button>
            <Button
              variant="destructive"
              disabled={pending || !reason || (reason === "Other" && !note.trim())}
              onClick={() => send(() => returnOrderAction({ ...base, reason, note }))}
            >
              {pending ? "Saving…" : "Mark returned"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "cancelled"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {order.orderNo}</DialogTitle>
            <DialogDescription>
              {committed ? "The items go back into stock" : "Held stock goes back on sale"} and any coupon use is given
              back.
              {advance && " If the customer sent an advance, refund it from the Payment card."}
            </DialogDescription>
          </DialogHeader>
          <ReasonFields
            id="cancel"
            reasons={CANCEL_REASONS}
            reason={reason}
            setReason={setReason}
            note={note}
            setNote={setNote}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={close} disabled={pending}>
              Keep the order
            </Button>
            <Button
              variant="destructive"
              disabled={pending || !reason || (reason === "Other" && !note.trim())}
              onClick={() => send(() => cancelOrderAction({ ...base, reason, note }))}
            >
              {pending ? "Cancelling…" : "Cancel order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NoteField({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Note (optional)</Label>
      <Input
        id={id}
        maxLength={500}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ReasonFields({
  id,
  reasons,
  reason,
  setReason,
  note,
  setNote,
}: {
  id: string;
  reasons: readonly string[];
  reason: string;
  setReason: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-reason`}>Reason</Label>
        <select id={`${id}-reason`} className={selectClass} value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Choose a reason</option>
          {reasons.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-note`}>Note {reason === "Other" ? "" : "(optional)"}</Label>
        <Input id={`${id}-note`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </div>
  );
}
