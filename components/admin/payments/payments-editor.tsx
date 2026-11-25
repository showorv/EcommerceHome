"use client";

import { QrCode, Upload, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Field, report, selectClass } from "@/components/admin/catalog/form-bits";
import { uploadMedia } from "@/components/admin/catalog/media-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { savePaymentSettingsAction } from "@/modules/payments/actions";
import {
  PAY_HOW,
  PAY_HOW_NAMES,
  WALLET_NAMES,
  type PayHow,
  type PaymentSettings,
  type Wallet,
} from "@/modules/payments/payments";

type Row = Omit<Wallet, "number"> & { number: string };

/** Shown as 01XXXXXXXXX while editing. */
const local = (p: string) => p.replace(/^\+88/, "");

export function PaymentsEditor({ settings }: { settings: PaymentSettings }) {
  const [rows, setRows] = useState<Row[]>(() => settings.wallets.map((w) => ({ ...w, number: local(w.number) })));
  const [pending, start] = useTransition();
  const anyOn = rows.some((r) => r.active);

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function save() {
    start(async () => {
      report(await savePaymentSettingsAction({ wallets: rows }));
    });
  }

  return (
    <div className="grid gap-6">
      {!anyOn && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          No wallet is switched on, so checkout offers <strong>cash on delivery only</strong>, and areas whose zone
          needs an advance can&apos;t order.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {rows.map((r, i) => (
          <WalletCard key={r.type} row={r} onChange={(patch) => set(i, patch)} />
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save payment settings"}
        </Button>
        <p className="text-muted-foreground text-sm">Checkout shows the change right away.</p>
      </div>
    </div>
  );
}

function WalletCard({ row, onChange }: { row: Row; onChange: (patch: Partial<Row>) => void }) {
  const name = WALLET_NAMES[row.type];
  const id = `wallet-${row.type}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const up = await uploadMedia(file);
      if (up.kind !== "image") throw new Error("Pick an image file");
      onChange({ qrUrl: up.url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <CardTitle>{name}</CardTitle>
          <CardDescription>
            {row.active ? "Shown at checkout for advance payments." : "Not shown at checkout."}
          </CardDescription>
        </div>
        <Switch
          checked={row.active}
          onCheckedChange={(active) => onChange({ active })}
          aria-label={`Take ${name} payments`}
        />
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${name} number`} htmlFor={`${id}-number`} hint="The number customers send money to.">
            <Input
              id={`${id}-number`}
              type="tel"
              inputMode="tel"
              placeholder="01XXXXXXXXX"
              maxLength={18}
              value={row.number}
              onChange={(e) => onChange({ number: e.target.value })}
            />
          </Field>
          <Field label="Account name (optional)" htmlFor={`${id}-name`} hint="Helps customers check before sending.">
            <Input
              id={`${id}-name`}
              maxLength={60}
              value={row.accountName}
              onChange={(e) => onChange({ accountName: e.target.value })}
            />
          </Field>
        </div>
        <Field
          label="Customers choose"
          htmlFor={`${id}-how`}
          hint={
            'A bKash Personal Retail Account (PRA) usually takes "Make Payment"; a personal number takes "Send Money".'
          }
        >
          <select
            id={`${id}-how`}
            className={selectClass}
            value={row.how}
            onChange={(e) => onChange({ how: e.target.value as PayHow })}
          >
            {PAY_HOW.map((h) => (
              <option key={h} value={h}>
                {PAY_HOW_NAMES[h]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="QR code (optional)" htmlFor={`${id}-qr`} hint={`The QR from your ${name} app, for scan-to-pay.`}>
          <div className="flex items-center gap-3">
            <div className="bg-muted grid size-24 shrink-0 place-items-center overflow-hidden rounded-md border">
              {row.qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin preview of the uploaded QR
                <img src={row.qrUrl} alt={`${name} QR code`} className="size-full object-contain" />
              ) : (
                <QrCode className="text-muted-foreground size-8" aria-hidden />
              )}
            </div>
            <input
              ref={fileRef}
              id={`${id}-qr`}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
                <Upload className="size-4" aria-hidden />
                {busy ? "Uploading…" : row.qrUrl ? "Replace" : "Upload QR"}
              </Button>
              {row.qrUrl && (
                <Button type="button" variant="ghost" onClick={() => onChange({ qrUrl: "" })}>
                  <X className="size-4" aria-hidden />
                  Remove
                </Button>
              )}
            </div>
          </div>
        </Field>
      </CardContent>
    </Card>
  );
}
