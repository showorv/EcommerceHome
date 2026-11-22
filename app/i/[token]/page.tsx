import { Download } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { formatTaka } from "@/lib/money";
import { invoiceOpenAllowed } from "@/modules/invoices/access";
import { invoiceByToken } from "@/modules/invoices/data";
import { invoiceDate } from "@/modules/invoices/invoices";
import { WALLET_NAMES } from "@/modules/payments/payments";

/**
 * The invoice link sent by SMS (FR-OR-04): anyone with the link sees the invoice, as it was when the
 * order was confirmed. An unknown, changed, expired or turned-off link is a plain 404.
 */

// Read on every request (the link can be turned off at any time); never indexed.
export const instant = false;

export const metadata: Metadata = {
  title: "Invoice",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "border-t pt-2 font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground mb-1 text-xs tracking-wide uppercase">{label}</div>
      <div className="text-sm break-words">{children}</div>
    </div>
  );
}

export default async function InvoicePage({ params }: PageProps<"/i/[token]">) {
  const { token } = await params;
  await connection();
  if (!(await invoiceOpenAllowed())) {
    return (
      <main className="mx-auto grid max-w-md gap-3 px-4 py-24 text-center">
        <h1 className="text-xl font-semibold">Too many tries</h1>
        <p className="text-muted-foreground">Please wait a few minutes and open the link again.</p>
      </main>
    );
  }
  const found = await invoiceByToken(token);
  if (!found) notFound();
  const s = found.snapshot;
  const gone = found.orderStatus === "cancelled" || found.orderStatus === "returned";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      {gone && (
        <p className="mb-6 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          This order was {found.orderStatus === "cancelled" ? "cancelled" : "returned"}. The invoice is kept for your
          records.
        </p>
      )}
      <article className="bg-card rounded-lg border p-5 sm:p-8">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:justify-between">
          <div className="min-w-0">
            <div className="text-xl font-bold">{s.store.name}</div>
            <div className="text-muted-foreground mt-1 text-sm break-words">
              {[s.store.address, s.store.phone, s.store.email].filter(Boolean).map((v) => (
                <div key={v}>{v}</div>
              ))}
            </div>
          </div>
          <div className="sm:text-right">
            <h1 className="text-lg font-bold tracking-widest">INVOICE</h1>
            <dl className="mt-1 grid gap-0.5 text-sm">
              <Row label="Invoice" value={s.invoiceNo} />
              <Row label="Order" value={s.orderNo} />
              <Row label="Invoice date" value={invoiceDate(s.issuedAt)} />
              <Row label="Order date" value={invoiceDate(s.orderedAt)} />
            </dl>
          </div>
        </header>

        <section className="grid gap-4 py-5 sm:grid-cols-3">
          <Block label="Bill to">
            <div className="font-medium">{s.customer.name}</div>
            <div>{s.customer.phone}</div>
            {s.customer.email && <div>{s.customer.email}</div>}
          </Block>
          <Block label="Deliver to">
            <div>{s.address.line}</div>
            <div>
              {s.address.area}, {s.address.district}
            </div>
          </Block>
          <Block label="Payment">{s.paymentMethod}</Block>
        </section>

        <ul className="divide-y border-y">
          {s.items.map((i, n) => (
            <li key={n} className="flex justify-between gap-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{i.title}</div>
                <div className="text-muted-foreground text-xs">
                  {[i.variantTitle, i.sku].filter(Boolean).join(" · ")}
                </div>
                <div className="text-muted-foreground text-xs tabular-nums">
                  {i.qty} × {formatTaka(i.price)}
                </div>
              </div>
              <div className="shrink-0 tabular-nums">{formatTaka(i.price * i.qty)}</div>
            </li>
          ))}
        </ul>

        <dl className="mt-4 ml-auto grid max-w-sm gap-1.5 text-sm">
          <Row label="Subtotal" value={formatTaka(s.subtotal)} />
          {s.discount > 0 && (
            <Row
              label={s.couponCode ? `Discount (${s.couponCode})` : "Discount"}
              value={`−${formatTaka(s.discount)}`}
            />
          )}
          <Row label={`Delivery (${s.address.zoneName})`} value={formatTaka(s.deliveryCharge)} />
          {s.codFee > 0 && <Row label="COD fee" value={formatTaka(s.codFee)} />}
          <Row label="Total" value={formatTaka(s.total)} strong />
          {s.advance && (
            <Row
              label={`Advance (${WALLET_NAMES[s.advance.method]}, TrxID …${s.advance.trxLast4})`}
              value={`−${formatTaka(s.advance.amount)}`}
            />
          )}
          <Row label="To pay on delivery" value={formatTaka(s.codAmount)} strong />
        </dl>

        {s.footer && <footer className="text-muted-foreground mt-6 border-t pt-4 text-sm">{s.footer}</footer>}
      </article>

      <div className="mt-6 flex justify-center">
        <Button asChild>
          {/* A file download, not a page: a plain link. */}
          <a href={`/i/${token}/pdf`} download>
            <Download /> Download PDF
          </a>
        </Button>
      </div>
    </main>
  );
}
