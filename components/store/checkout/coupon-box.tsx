"use client";

import { TicketPercent, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkCouponAction } from "@/modules/checkout/actions";
import { describeCoupon, type CouponTerms } from "@/modules/coupons/coupons";

/**
 * The coupon field in the order summary (FR-CO-04). "Apply" asks the server about the code once; after
 * that the page works the discount out live as the cart or the time changes, and the server checks it
 * again when the order is sent.
 */
export function CouponBox({
  coupon,
  phone,
  problem,
  onApply,
  onRemove,
  onEdit,
}: {
  coupon: CouponTerms | null;
  /** The phone typed so far, for the per-customer limit. */
  phone: string;
  /** Why the applied coupon doesn't work right now (cart changed, expired…), or the server's answer. */
  problem: string | null;
  onApply: (terms: CouponTerms) => void;
  onRemove: () => void;
  /** The customer changed the code: the server's last answer no longer applies. */
  onEdit: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  if (coupon) {
    return (
      <div className="grid gap-1">
        <div className="bg-success/10 flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <TicketPercent className="text-success size-4 shrink-0" aria-hidden />
            <span className="truncate">
              <strong className="font-mono">{coupon.code}</strong> · {describeCoupon(coupon)}
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onRemove}
            aria-label={`Remove coupon ${coupon.code}`}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        {problem && (
          <p id="co-couponCode-error" className="text-destructive text-xs font-medium" role="alert">
            {problem}
          </p>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="text-brand justify-self-start text-sm font-medium underline-offset-4 hover:underline"
        onClick={() => setOpen(true)}
      >
        Have a coupon code?
      </button>
    );
  }

  function apply() {
    if (!code.trim()) {
      setError("Enter a coupon code.");
      return;
    }
    start(async () => {
      const res = await checkCouponAction(code, phone).catch(() => null);
      if (!res) {
        setError("Couldn't reach the store. Check your connection and try again.");
        return;
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      setCode("");
      onApply(res.terms);
    });
  }

  return (
    <div className="grid gap-1.5">
      <label htmlFor="co-couponCode" className="text-sm font-medium">
        Coupon code
      </label>
      <div className="flex gap-2">
        <Input
          id="co-couponCode"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          className="font-mono uppercase placeholder:font-sans placeholder:normal-case"
          placeholder="Enter code"
          value={code}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "co-couponCode-error" : undefined}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
            onEdit();
          }}
          onKeyDown={(e) => {
            // Enter applies the code instead of sending the whole order.
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
        />
        <Button type="button" variant="outline" disabled={pending} onClick={apply}>
          {pending ? "Checking…" : "Apply"}
        </Button>
      </div>
      {(error ?? problem) && (
        <p id="co-couponCode-error" className="text-destructive text-xs font-medium" role="alert">
          {error ?? problem}
        </p>
      )}
    </div>
  );
}
