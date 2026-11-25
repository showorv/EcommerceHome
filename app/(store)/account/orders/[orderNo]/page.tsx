import { ArrowLeft, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountFrame } from "@/components/store/account/account-frame";
import { OrderHistory, OrderItems, OrderSteps, OrderTotals, StatusBadge } from "@/components/store/account/order-view";
import { ReorderButton } from "@/components/store/account/reorder-button";
import { Button } from "@/components/ui/button";
import { dhakaDateTime } from "@/modules/account/account";
import { myOrder, requireCustomer } from "@/modules/account/data";
import { isOrderNo } from "@/modules/orders/orders";

export const metadata: Metadata = { title: "Order", robots: { index: false, follow: false } };
// A private page with a different number for every order: there is no shell worth prerendering, so the
// navigation waits for it (instant navigation check).
export const instant = false;

const local = (p: string) => p.replace(/^\+88/, "");

/** One order (FR-AC-06): progress, what's in it, the invoice and "Order again". */
export default function OrderPage({ params }: PageProps<"/account/orders/[orderNo]">) {
  return (
    <AccountFrame title="Order details">
      <Order params={params} />
    </AccountFrame>
  );
}

async function Order({ params }: { params: PageProps<"/account/orders/[orderNo]">["params"] }) {
  const { orderNo } = await params;
  const c = await requireCustomer(`/account/orders/${isOrderNo(orderNo) ? orderNo : ""}`);
  if (!isOrderNo(orderNo)) notFound();
  const o = await myOrder(c, orderNo);
  if (!o) notFound();
  const f = o.full!;
  return (
    <div className="grid gap-6">
      <Link
        href="/account/orders"
        className="text-muted-foreground flex w-fit items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> All orders
      </Link>

      <section className="grid gap-4 rounded-lg border p-4 sm:p-5" aria-labelledby="order-no">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="order-no" className="font-mono text-lg font-semibold tracking-wide">
              {o.orderNo}
            </h2>
            <p className="text-muted-foreground text-xs">Placed {dhakaDateTime(o.placedAt)}</p>
          </div>
          <StatusBadge status={o.status} label={o.statusLabel} />
        </div>
        <p className="text-sm">{o.statusText}</p>
        <OrderSteps steps={o.steps} />
      </section>

      <div className="flex flex-wrap gap-2">
        <ReorderButton orderNo={o.orderNo} />
        {f.invoiceNo && (
          <Button asChild variant="outline">
            <a href={`/account/orders/${o.orderNo}/invoice`} target="_blank" rel="noopener">
              <FileText className="size-4" aria-hidden /> Invoice {f.invoiceNo} (PDF)
            </a>
          </Button>
        )}
      </div>

      <section className="grid gap-3 rounded-lg border p-4 sm:p-5" aria-labelledby="items-title">
        <h2 id="items-title" className="font-semibold">
          {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
        </h2>
        <OrderItems items={o.items} />
        <div className="border-t pt-3">
          <OrderTotals order={o} />
        </div>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="grid content-start gap-1 rounded-lg border p-4 text-sm sm:p-5" aria-labelledby="to-title">
          <h2 id="to-title" className="mb-1 font-semibold">
            Delivery to
          </h2>
          <p>
            {f.name}, {local(f.phone)}
          </p>
          <p className="text-muted-foreground break-words">{[f.line, o.place].filter(Boolean).join(", ")}</p>
          {f.note && <p className="text-muted-foreground break-words">Note: {f.note}</p>}
        </section>
        <section className="grid content-start gap-2 rounded-lg border p-4 sm:p-5" aria-labelledby="history-title">
          <h2 id="history-title" className="mb-1 font-semibold">
            History
          </h2>
          <OrderHistory timeline={o.timeline} />
        </section>
      </div>

      {!f.invoiceNo && o.status !== "cancelled" && (
        <p className="text-muted-foreground text-xs">The invoice appears here once we confirm your order.</p>
      )}
    </div>
  );
}
