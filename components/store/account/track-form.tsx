"use client";

import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trackOrderAction } from "@/modules/account/actions";
import type { CustomerOrder } from "@/modules/account/order-view";
import { normalizeOrderNo } from "@/modules/account/account";
import { OrderSummary } from "./order-view";

type Fields = Partial<Record<"orderNo" | "phone", string>>;

/**
 * Track an order with its number and mobile number (FR-AC-07). Sent as a server action, so the phone
 * never goes into the address bar or the server's logs.
 */
export function TrackForm({ initialOrderNo = "" }: { initialOrderNo?: string }) {
  const [orderNo, setOrderNo] = useState(initialOrderNo);
  const [phone, setPhone] = useState("");
  const [fields, setFields] = useState<Fields>({});
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    setFields({});
    start(async () => {
      const res = await trackOrderAction({ orderNo, phone }).catch(() => ({
        ok: false as const,
        error: "Couldn't reach the store. Check your connection.",
      }));
      if (res.ok) {
        setOrder(res.order);
        return;
      }
      setOrder(null);
      setError(res.error);
      if ("fields" in res && res.fields) setFields(res.fields);
    });
  }

  const invalid = (k: keyof Fields) => ({
    "aria-invalid": fields[k] ? true : undefined,
    "aria-describedby": fields[k] ? `track-${k}-error` : undefined,
  });

  return (
    <div className="grid gap-8">
      <form
        className="grid gap-4 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="track-orderNo">Order number</Label>
          <Input
            id="track-orderNo"
            autoComplete="off"
            placeholder="SR10234"
            maxLength={30}
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value)}
            {...invalid("orderNo")}
          />
          {fields.orderNo && (
            <p id="track-orderNo-error" className="text-destructive text-xs">
              {fields.orderNo}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="track-phone">Mobile number used for the order</Label>
          <Input
            id="track-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="01XXXXXXXXX"
            maxLength={18}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            {...invalid("phone")}
          />
          {fields.phone && (
            <p id="track-phone-error" className="text-destructive text-xs">
              {fields.phone}
            </p>
          )}
        </div>
        <Button type="submit" disabled={pending} className="sm:mt-[1.375rem]">
          {pending ? "Looking…" : "Track order"}
        </Button>
        {error && (
          <p className="text-destructive text-sm sm:col-span-3" role="alert">
            {error}
          </p>
        )}
      </form>

      {order && (
        <section aria-live="polite" aria-label={`Order ${order.orderNo}`}>
          <OrderSummary order={order} />
        </section>
      )}
    </div>
  );
}

/** The form with the order number from `?order=` filled in (the thank-you page links here that way). */
export function TrackFormFromUrl() {
  const order = normalizeOrderNo(useSearchParams().get("order") ?? "");
  return <TrackForm initialOrderNo={order ?? ""} />;
}
