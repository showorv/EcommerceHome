import { Check, ImageOff, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import { dhakaDateTime, type Step } from "@/modules/account/account";
import type { CustomerOrder } from "@/modules/account/order-view";
import { PAYMENT_METHOD_NAMES } from "@/modules/checkout/checkout";

/**
 * One order as its customer sees it (FR-AC-06/07): where it is, what's in it, and what's left to pay.
 * Used by the account's order page and by guest tracking, so it works on the server and in the browser.
 */

const STATUS_TONE: Record<string, string> = {
  delivered: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  partially_delivered: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  cancelled: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/40",
  returned: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/40",
  on_hold: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_TONE[status] ?? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      )}
    >
      {label}
    </span>
  );
}

export function OrderSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid gap-0 sm:flex" aria-label="Order progress">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.key} className="relative flex gap-3 pb-5 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:pb-0">
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-7 bottom-0 left-[13px] w-0.5 sm:top-[13px] sm:right-[-50%] sm:bottom-auto sm:left-1/2 sm:h-0.5 sm:w-auto",
                  s.state === "done" ? "bg-brand" : "bg-border",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs",
                s.state === "done" && "border-brand bg-brand text-brand-foreground",
                s.state === "current" && "border-brand bg-background text-brand",
                s.state === "todo" && "border-border bg-background text-muted-foreground",
                s.state === "stopped" && "border-red-600 bg-red-600 text-white",
              )}
            >
              {s.state === "done" ? (
                <Check className="size-4" aria-hidden />
              ) : s.state === "stopped" ? (
                <X className="size-4" aria-hidden />
              ) : (
                <span className={cn("size-2 rounded-full", s.state === "current" ? "bg-brand" : "bg-border")} />
              )}
            </span>
            <span className="grid min-w-0 content-start gap-0.5 sm:text-center">
              <span
                className={cn(
                  "text-sm leading-tight",
                  s.state === "todo" ? "text-muted-foreground" : "font-medium",
                  s.state === "current" && "text-brand",
                )}
              >
                {s.label}
                <span className="sr-only">
                  {s.state === "done"
                    ? " (done)"
                    : s.state === "current"
                      ? " (now)"
                      : s.state === "stopped"
                        ? ""
                        : " (to come)"}
                </span>
              </span>
              {s.at && <span className="text-muted-foreground text-xs">{dhakaDateTime(s.at)}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderItems({ items }: { items: CustomerOrder["items"] }) {
  return (
    <ul className="grid gap-3">
      {items.map((i, n) => (
        <li key={n} className="flex items-center gap-3">
          <span className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-md">
            {i.image ? (
              <Image src={i.image} alt="" fill sizes="56px" className="object-cover" />
            ) : (
              <ImageOff className="text-muted-foreground absolute inset-0 m-auto size-4" aria-hidden />
            )}
          </span>
          <span className="min-w-0 flex-1 text-sm">
            {i.slug ? (
              <Link href={`/p/${i.slug}`} className="line-clamp-2 font-medium hover:underline">
                {i.title}
              </Link>
            ) : (
              <span className="line-clamp-2 font-medium">{i.title}</span>
            )}
            <span className="text-muted-foreground block text-xs">
              {i.variantTitle ? `${i.variantTitle} · ` : ""}
              {i.qty} × {formatTaka(i.price)}
            </span>
          </span>
          <span className="text-sm font-medium tabular-nums">{formatTaka(i.price * i.qty)}</span>
        </li>
      ))}
    </ul>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right tabular-nums", muted ? "text-muted-foreground" : "font-medium")}>{value}</dd>
    </div>
  );
}

export function OrderTotals({ order: o }: { order: CustomerOrder }) {
  return (
    <dl className="grid gap-1.5 text-sm">
      <Row label="Subtotal" value={formatTaka(o.subtotal)} />
      {o.discount > 0 && <Row label={`Coupon ${o.couponCode ?? ""}`.trim()} value={`−${formatTaka(o.discount)}`} />}
      <Row label="Delivery" value={o.deliveryCharge === 0 ? "Free" : formatTaka(o.deliveryCharge)} />
      {o.codFee > 0 && <Row label="Cash on delivery fee" value={formatTaka(o.codFee)} />}
      <div className="mt-1 flex justify-between gap-3 border-t pt-2 text-base font-semibold">
        <dt>Total</dt>
        <dd className="tabular-nums">{formatTaka(o.total)}</dd>
      </div>
      <Row label="Payment" value={`${PAYMENT_METHOD_NAMES[o.paymentMethod] ?? ""} · ${o.payment}`} muted />
      {o.toPay > 0 && <Row label="Pay at the door" value={formatTaka(o.toPay)} />}
    </dl>
  );
}

export function OrderHistory({ timeline }: { timeline: CustomerOrder["timeline"] }) {
  return (
    <ul className="grid gap-2 text-sm">
      {timeline.map((t, i) => (
        <li key={i} className="flex flex-wrap justify-between gap-x-3">
          <span className={i === 0 ? "font-medium" : "text-muted-foreground"}>{t.label}</span>
          <span className="text-muted-foreground text-xs tabular-nums">{dhakaDateTime(t.at)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Heading, progress, items and totals: everything guest tracking shows. */
export function OrderSummary({ order: o }: { order: CustomerOrder }) {
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-lg font-semibold tracking-wide">{o.orderNo}</p>
          <p className="text-muted-foreground text-xs">Placed {dhakaDateTime(o.placedAt)}</p>
        </div>
        <StatusBadge status={o.status} label={o.statusLabel} />
      </div>
      <p className="text-sm">{o.statusText}</p>
      <OrderSteps steps={o.steps} />
      <section className="grid gap-3 rounded-lg border p-4" aria-label="Items">
        <OrderItems items={o.items} />
        <div className="border-t pt-3">
          <OrderTotals order={o} />
        </div>
      </section>
      {o.place && (
        <p className="text-muted-foreground text-sm">
          Delivery to <span className="text-foreground">{o.place}</span>
        </p>
      )}
    </div>
  );
}
