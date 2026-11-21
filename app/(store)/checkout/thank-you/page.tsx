import { CheckCircle2, ImageOff, PhoneCall } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getReceiptOrder, type ReceiptView } from "@/modules/orders/data";
import { WALLET_NAMES } from "@/modules/payments/payments";

/**
 * The thank-you page (SRS §2.5): the order number, what was ordered and what happens next. Only the
 * browser that placed the order sees it (a signed cookie, for 6 hours). Kept out of search engines.
 */

export const metadata: Metadata = {
  title: "Thank you for your order",
  robots: { index: false, follow: false },
};

export default function ThankYouPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-8 pb-16">
      <Suspense fallback={<p className="text-muted-foreground py-16 text-center">Loading your order…</p>}>
        <Receipt />
      </Suspense>
    </div>
  );
}

async function Receipt() {
  const order = await getReceiptOrder();
  if (!order) {
    return (
      <div className="grid place-items-center gap-4 rounded-lg border border-dashed px-4 py-16 text-center">
        <p className="text-lg font-semibold">No recent order on this device</p>
        <p className="text-muted-foreground max-w-sm text-sm">
          Your order is safe with us. We text and call the number on the order to confirm it.
        </p>
        <Button asChild>
          <Link href="/">Continue shopping</Link>
        </Button>
      </div>
    );
  }
  return <OrderReceipt order={order} />;
}

const local = (phone: string) => phone.replace(/^\+88/, "");

function OrderReceipt({ order: o }: { order: ReceiptView }) {
  const days = o.minDays === o.maxDays ? `${o.minDays}` : `${o.minDays}–${o.maxDays}`;
  return (
    <div className="grid gap-6">
      <header className="grid justify-items-center gap-2 text-center">
        <CheckCircle2 className="text-success size-12" aria-hidden />
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Thank you, {o.name.split(" ")[0]}!</h1>
        <p className="text-muted-foreground">Your order has been received.</p>
        <p className="mt-2 rounded-md border px-4 py-2">
          Order number <strong className="font-mono text-lg tracking-wide">{o.orderNo}</strong>
        </p>
      </header>

      <section className="bg-muted/40 grid gap-2 rounded-lg border p-4 text-sm sm:p-5" aria-labelledby="next-title">
        <h2 id="next-title" className="flex items-center gap-2 text-base font-semibold">
          <PhoneCall className="size-4" aria-hidden /> What happens next
        </h2>
        <ol className="text-muted-foreground grid list-decimal gap-1 pl-5">
          <li>
            We&apos;ll call <span className="text-foreground font-medium">{local(o.phone)}</span> to confirm your order.
            Please keep your phone close.
          </li>
          {o.advance && (
            <li>
              We check your {WALLET_NAMES[o.advance.method]} payment of {formatTaka(o.advance.amount)} (TrxID ending{" "}
              <span className="text-foreground font-mono">{o.advance.trxIdEnd}</span>).
            </li>
          )}
          <li>Once confirmed, we text you the invoice and ship it. It arrives in {days} days.</li>
        </ol>
      </section>

      <section className="grid gap-4 rounded-lg border p-4 sm:p-5" aria-labelledby="order-title">
        <h2 id="order-title" className="text-base font-semibold">
          Your order
        </h2>
        <ul className="grid gap-3">
          {o.items.map((i, n) => (
            <li key={n} className="flex items-center gap-3">
              <span className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-md">
                {i.image ? (
                  <Image src={i.image} alt="" fill sizes="56px" className="object-cover" />
                ) : (
                  <ImageOff className="text-muted-foreground absolute inset-0 m-auto size-4" aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="line-clamp-2 font-medium">{i.title}</span>
                <span className="text-muted-foreground block text-xs">
                  {i.variantTitle ? `${i.variantTitle} · ` : ""}
                  {i.qty} × {formatTaka(i.price)}
                </span>
              </span>
              <span className="text-sm font-medium tabular-nums">{formatTaka(i.price * i.qty)}</span>
            </li>
          ))}
        </ul>
        <dl className="grid gap-1.5 border-t pt-3 text-sm">
          <Row label="Subtotal" value={formatTaka(o.subtotal)} />
          {o.discount > 0 && <Row label={`Coupon ${o.couponCode ?? ""}`.trim()} value={`−${formatTaka(o.discount)}`} />}
          <Row label="Delivery" value={o.deliveryFree ? "Free" : formatTaka(o.deliveryCharge)} />
          {o.codFee > 0 && <Row label="Cash on delivery fee" value={formatTaka(o.codFee)} />}
          <div className="mt-1 flex justify-between gap-3 border-t pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatTaka(o.total)}</dd>
          </div>
          {o.advance && (
            <Row
              label={`Paid by ${WALLET_NAMES[o.advance.method]} (to be checked)`}
              value={formatTaka(o.advance.amount)}
              muted
            />
          )}
          <Row label="Pay at the door" value={formatTaka(o.codAmount)} muted />
        </dl>
        <div className="grid gap-1 border-t pt-3 text-sm">
          <p className="font-medium">Delivery to</p>
          <p className="text-muted-foreground">
            {o.name}, {local(o.phone)}
            <br />
            {o.address}
          </p>
        </div>
      </section>

      <div className="flex justify-center">
        <Button asChild size="lg">
          <Link href="/">Continue shopping</Link>
        </Button>
      </div>
    </div>
  );
}

function Row({ label: text, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{text}</dt>
      <dd className={cn("text-right tabular-nums", muted ? "text-muted-foreground" : "font-medium")}>{value}</dd>
    </div>
  );
}
