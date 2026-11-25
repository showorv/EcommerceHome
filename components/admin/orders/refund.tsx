"use client";

import { Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { report } from "@/components/admin/catalog/form-bits";
import { Button } from "@/components/ui/button";
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
import { refundOrderAction } from "@/modules/orders/admin-actions";

/** Mark money sent back by hand (FR-OR-02). The amount starts at everything the shop received. */
export function RefundButton({ orderNo, rev, received }: { orderNo: string; rev: number; received: number }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(received / 100));
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setAmount(String(received / 100));
    setNote("");
  }

  return (
    <>
      <Button variant="outline" size="sm" className="w-fit" onClick={() => setOpen(true)}>
        <Undo2 className="size-4" aria-hidden /> Mark refunded
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund {orderNo}</DialogTitle>
            <DialogDescription>
              Send the money back from your wallet first, then record it here. The shop received {formatTaka(received)}{" "}
              for this order.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="refund-amount">Amount sent back (৳)</Label>
              <Input
                id="refund-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="refund-note">How it was sent</Label>
              <Input
                id="refund-note"
                maxLength={500}
                placeholder="e.g. bKash to 01712345678, TrxID 9ABC12XYZ"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={close} disabled={pending}>
              Back
            </Button>
            <Button
              disabled={pending || !note.trim() || !(Number(amount) > 0)}
              onClick={() =>
                start(async () => {
                  if (report(await refundOrderAction({ orderNo, rev, amount, note }))) {
                    setOpen(false);
                    setNote("");
                  }
                })
              }
            >
              {pending ? "Saving…" : "Mark refunded"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
