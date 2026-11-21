"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import { PAY_HOW_NAMES, showBdPhone, WALLET_NAMES, type Wallet, type WalletType } from "@/modules/payments/payments";

/**
 * The advance payment part of checkout (SRS §2.1–2.2): which wallet, how much to send and where (number,
 * QR), then the sender number and the TrxID from the confirmation SMS. Staff check the TrxID against
 * the wallet statement before confirming the order.
 */

type Errors = Partial<Record<"payWallet" | "senderNumber" | "trxId", string>>;

export function AdvancePayment({
  wallets,
  payWallet,
  senderNumber,
  trxId,
  amount,
  errors,
  onChange,
}: {
  wallets: Wallet[];
  payWallet: WalletType | "";
  senderNumber: string;
  trxId: string;
  /** Advance due now, or null before an area is chosen. */
  amount: number | null;
  errors: Errors;
  onChange: (patch: { payWallet?: WalletType; senderNumber?: string; trxId?: string }) => void;
}) {
  const wallet = wallets.find((w) => w.type === payWallet) ?? null;
  const name = wallet ? WALLET_NAMES[wallet.type] : "wallet";

  return (
    <div className="bg-muted/40 grid gap-4 rounded-lg border p-4">
      <fieldset className="grid gap-2" aria-describedby={errors.payWallet ? "co-payWallet-error" : undefined}>
        <legend className="mb-2 text-sm font-medium">Pay the advance with</legend>
        <div className="flex flex-wrap gap-2">
          {wallets.map((w, i) => (
            <label
              key={w.type}
              className={cn(
                "has-[:focus-visible]:ring-ring/50 bg-background flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium has-[:focus-visible]:ring-[3px]",
                payWallet === w.type && "border-brand bg-brand/5",
              )}
            >
              <input
                id={i === 0 ? "co-payWallet" : undefined}
                type="radio"
                name="payWallet"
                value={w.type}
                checked={payWallet === w.type}
                onChange={() => onChange({ payWallet: w.type })}
                className="accent-brand size-4"
              />
              {WALLET_NAMES[w.type]}
            </label>
          ))}
        </div>
        {errors.payWallet && <FieldMessage id="payWallet" text={errors.payWallet} />}
      </fieldset>

      {wallet && (
        <div className="bg-background grid gap-4 rounded-md border p-4 sm:grid-cols-[1fr_auto]">
          <ol className="grid list-decimal gap-2 pl-5 text-sm">
            <li>
              Open the {name} app and choose <strong>{PAY_HOW_NAMES[wallet.how]}</strong>.
            </li>
            <li>
              Send <strong className="tabular-nums">{amount === null ? "the advance" : formatTaka(amount)}</strong> to{" "}
              <span className="inline-flex items-center gap-1">
                <strong className="tabular-nums">{showBdPhone(wallet.number)}</strong>
                <CopyButton value={wallet.number.replace(/^\+88/, "")} label={`Copy the ${name} number`} />
              </span>
              {wallet.accountName && <span className="text-muted-foreground"> ({wallet.accountName})</span>}.
              {amount === null && <span className="text-muted-foreground"> Choose your area to see the amount.</span>}
            </li>
            <li>Type the number you sent from and the TrxID from the {name} SMS below.</li>
          </ol>
          {wallet.qrUrl && (
            <figure className="grid justify-items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- small uploaded QR, shown as is */}
              <img
                src={wallet.qrUrl}
                alt={`${name} QR code for ${showBdPhone(wallet.number)}`}
                className="size-32 rounded border bg-white object-contain p-1"
              />
              <figcaption className="text-muted-foreground text-xs">Or scan in the {name} app</figcaption>
            </figure>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="co-senderNumber">Your {name} number</Label>
          <Input
            id="co-senderNumber"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="01XXXXXXXXX"
            maxLength={18}
            value={senderNumber}
            onChange={(e) => onChange({ senderNumber: e.target.value })}
            aria-invalid={errors.senderNumber ? true : undefined}
            aria-describedby={errors.senderNumber ? "co-senderNumber-error" : "co-senderNumber-hint"}
          />
          {errors.senderNumber ? (
            <FieldMessage id="senderNumber" text={errors.senderNumber} />
          ) : (
            <p id="co-senderNumber-hint" className="text-muted-foreground text-xs">
              The number the money was sent from.
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="co-trxId">Transaction ID (TrxID)</Label>
          <Input
            id="co-trxId"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="e.g. 9BC4D7EF2A"
            maxLength={30}
            value={trxId}
            onChange={(e) => onChange({ trxId: e.target.value })}
            className="uppercase placeholder:normal-case"
            aria-invalid={errors.trxId ? true : undefined}
            aria-describedby={errors.trxId ? "co-trxId-error" : "co-trxId-hint"}
          />
          {errors.trxId ? (
            <FieldMessage id="trxId" text={errors.trxId} />
          ) : (
            <p id="co-trxId-hint" className="text-muted-foreground text-xs">
              In the SMS {wallet ? name : "the wallet"} sends after the payment.
            </p>
          )}
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        We check every payment against our {wallet ? name : "wallet"} statement before confirming your order.
      </p>
    </div>
  );
}

function FieldMessage({ id, text }: { id: string; text: string }) {
  return (
    <p id={`co-${id}-error`} className="text-destructive text-xs font-medium">
      {text}
    </p>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="text-success size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      <span className="sr-only">{copied ? "Copied" : label}</span>
    </Button>
  );
}
