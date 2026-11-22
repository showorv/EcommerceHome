"use client";

import { Ban, Copy, Download, Link2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { report } from "@/components/admin/catalog/form-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { AdminInvoice } from "@/modules/invoices/data";
import { newInvoiceLinkAction, revokeInvoiceLinkAction } from "@/modules/invoices/actions";
import { LINK_STATE_NAMES } from "@/modules/invoices/invoices";

type Props = { orderNo: string; invoice: AdminInvoice; issued: string; expires: string; canWrite: boolean };

/** The order's invoice (FR-OR-03/04): number, the customer's link and its state, PDF, new link, turn off. */
export function InvoiceCard({ orderNo, invoice, issued, expires, canWrite }: Props) {
  const [dialog, setDialog] = useState<"new" | "revoke" | null>(null);
  const [sendSms, setSendSms] = useState(true);
  const [pending, start] = useTransition();
  const works = invoice.state === "active";

  async function copy() {
    try {
      await navigator.clipboard.writeText(invoice.link);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it by hand.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono font-medium">{invoice.invoiceNo}</span>
          <Badge variant={works ? "secondary" : "destructive"}>{LINK_STATE_NAMES[invoice.state]}</Badge>
        </div>
        <p className="text-muted-foreground">
          Issued {issued}.{" "}
          {works
            ? `The link works until ${expires}.`
            : invoice.state === "expired"
              ? `The link expired ${expires}.`
              : "Make a new link to share it again."}
        </p>
        {works && <p className="bg-muted rounded-md p-2 font-mono text-xs break-all">{invoice.link}</p>}
        <div className="flex flex-wrap gap-2">
          {works && (
            <Button variant="outline" size="sm" onClick={copy}>
              <Copy className="size-4" aria-hidden /> Copy link
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <a href={`/admin/orders/${orderNo}/invoice`} target="_blank" rel="noopener">
              <Download className="size-4" aria-hidden /> PDF
            </a>
          </Button>
          {canWrite && (
            <Button variant="outline" size="sm" onClick={() => setDialog("new")}>
              <Link2 className="size-4" aria-hidden /> New link
            </Button>
          )}
          {canWrite && works && (
            <Button variant="outline" size="sm" onClick={() => setDialog("revoke")}>
              <Ban className="size-4" aria-hidden /> Turn off link
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && !pending && setDialog(null)}>
        <DialogContent>
          {dialog === "new" ? (
            <>
              <DialogHeader>
                <DialogTitle>New link for {invoice.invoiceNo}</DialogTitle>
                <DialogDescription>
                  The current link stops working at once. Use this if the link was shared with the wrong person or has
                  expired.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <Checkbox id="invoice-sms" checked={sendSms} onCheckedChange={(v) => setSendSms(v === true)} />
                <Label htmlFor="invoice-sms">Send the new link to the customer (SMS, and email if they gave one)</Label>
              </div>
            </>
          ) : (
            <DialogHeader>
              <DialogTitle>Turn off the link for {invoice.invoiceNo}?</DialogTitle>
              <DialogDescription>
                Anyone opening it will see &quot;link doesn&apos;t work&quot;. You can make a new link later; the
                invoice itself is kept.
              </DialogDescription>
            </DialogHeader>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={pending}>
              Back
            </Button>
            <Button
              variant={dialog === "revoke" ? "destructive" : "default"}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r =
                    dialog === "new"
                      ? await newInvoiceLinkAction({ orderNo, sendSms })
                      : await revokeInvoiceLinkAction({ orderNo });
                  if (report(r)) setDialog(null);
                })
              }
            >
              {pending ? "Saving…" : dialog === "new" ? "Make new link" : "Turn off link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
