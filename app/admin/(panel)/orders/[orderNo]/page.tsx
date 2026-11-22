import { ArrowLeft, Pencil, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CallLog, Notes } from "@/components/admin/orders/calls-and-notes";
import { dhakaTime, PaymentBadge, RiskBadge, showPhone, StatusBadge, telHref } from "@/components/admin/orders/bits";
import { InvoiceCard } from "@/components/admin/orders/invoice-card";
import { OrderActions } from "@/components/admin/orders/order-actions";
import { RefundButton } from "@/components/admin/orders/refund";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTaka } from "@/lib/money";
import { requireStaff } from "@/modules/auth/session";
import { PAYMENT_METHOD_NAMES } from "@/modules/checkout/checkout";
import { BLOCK_KIND_NAMES } from "@/modules/customers/blocks";
import { adminInvoice } from "@/modules/invoices/data";
import { getAdminOrder, phoneSummary, requestTime } from "@/modules/orders/admin-data";
import { canRefund, moneyIn } from "@/modules/orders/lifecycle";
import { isOrderNo, ORDER_STATUS_NAMES, PAYMENT_STATUS_NAMES, type OrderStatus } from "@/modules/orders/orders";
import { canEdit } from "@/modules/orders/staff";
import { WALLET_NAMES } from "@/modules/payments/payments";

// The signed-in staff member and the live order, on every request.
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/admin/orders/[orderNo]">): Promise<Metadata> {
  const { orderNo } = await params;
  return { title: isOrderNo(orderNo) ? `Order ${orderNo}` : "Order" };
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

export default async function OrderPage({ params }: PageProps<"/admin/orders/[orderNo]">) {
  const { permissions } = await requireStaff("orders.view");
  const { orderNo } = await params;
  if (!isOrderNo(orderNo)) notFound();
  const order = await getAdminOrder(orderNo);
  if (!order) notFound();
  const now = await requestTime();
  const [others, invoice] = await Promise.all([
    phoneSummary(order.customer.phone, order.orderNo),
    adminInvoice(order.id, now),
  ]);
  const mayUpdate = permissions.has("orders.update");
  const a = order.advance;
  const history = [
    ...order.statusHistory.map((h) => ({
      at: h.at,
      title: ORDER_STATUS_NAMES[h.status] ?? h.status,
      lines: h.note ? [h.note] : [],
      by: h.byName,
    })),
    ...order.paymentHistory.map((h) => ({
      at: h.at,
      title: `Payment: ${PAYMENT_STATUS_NAMES[h.status] ?? h.status}`,
      lines: h.note ? [h.note] : [],
      by: h.byName,
    })),
    ...order.edits.map((e) => ({
      at: e.at,
      title: "Edited",
      lines: [...e.changes, ...(e.reason ? [`Why: ${e.reason}`] : [])],
      by: e.byName,
    })),
  ].sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
  const cameBack = new Map(order.returnedItems.map((r) => [r.variantId, r.qty]));
  const received = moneyIn(order);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Link
          href="/admin/orders"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden /> Orders
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{order.orderNo}</h1>
              <StatusBadge status={order.status} />
              <PaymentBadge status={order.paymentStatus} />
              <RiskBadge level={order.risk.level} score={order.risk.score} />
            </div>
            <p className="text-muted-foreground text-sm">Placed {dhakaTime(order.createdAt, now)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {mayUpdate && canEdit(order.status) && (
              <Button asChild variant="outline">
                <Link href={`/admin/orders/${order.orderNo}/edit`}>
                  <Pencil className="size-4" aria-hidden /> Edit
                </Link>
              </Button>
            )}
            <OrderActions
              order={order}
              may={{
                confirm: permissions.has("orders.confirm"),
                update: mayUpdate,
                cancel: permissions.has("orders.cancel"),
              }}
            />
          </div>
        </div>
        {order.status === "cancelled" && order.cancelReason && (
          <p className="text-muted-foreground text-sm">Cancelled: {order.cancelReason}</p>
        )}
        {order.status === "returned" && order.returnReason && (
          <p className="text-muted-foreground text-sm">Returned: {order.returnReason}</p>
        )}
        {canEdit(order.status) && (
          <p className="text-muted-foreground text-sm">
            {order.reservation.active
              ? `Stock held until ${dhakaTime(order.reservation.until, now)}.`
              : "The stock hold has ended: confirming takes the items only if they are still in stock."}
          </p>
        )}
      </div>

      {/* Narrow screens: items, then customer and calls, then history. Wide: two columns. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="contents xl:order-1 xl:grid xl:content-start xl:gap-6">
          <Card className="order-1">
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.items.map((i) => (
                      <TableRow key={i.variantId}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {i.image ? (
                              // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail
                              <img src={i.image} alt="" className="bg-muted size-10 rounded-md object-cover" />
                            ) : (
                              <div className="bg-muted size-10 rounded-md" />
                            )}
                            <div className="min-w-0">
                              <div className="font-medium">{i.title}</div>
                              <div className="text-muted-foreground text-xs">
                                {[i.variantTitle, i.sku].filter(Boolean).join(" · ")}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatTaka(i.price)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {i.qty}
                          {cameBack.get(i.variantId) ? (
                            <div className="text-xs text-red-700 dark:text-red-300">
                              {cameBack.get(i.variantId)} came back
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatTaka(i.price * i.qty)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <dl className="ml-auto grid w-full max-w-xs gap-1.5">
                <Row label="Subtotal">{formatTaka(order.subtotal)}</Row>
                {order.discount > 0 && (
                  <Row label={order.couponCode ? `Discount (${order.couponCode})` : "Discount"}>
                    −{formatTaka(order.discount)}
                  </Row>
                )}
                <Row label={`Delivery (${order.zoneName})`}>{formatTaka(order.deliveryCharge)}</Row>
                {order.codFee > 0 && <Row label="COD fee">{formatTaka(order.codFee)}</Row>}
                <div className="flex justify-between gap-4 border-t pt-1.5 font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatTaka(order.total)}</span>
                </div>
                {a && <Row label="Advance">−{formatTaka(a.amount)}</Row>}
                <Row label="To collect at the door">{formatTaka(order.codAmount)}</Row>
                {order.codCollected > 0 && <Row label="Collected">{formatTaka(order.codCollected)}</Row>}
                {order.refund && <Row label="Refunded">−{formatTaka(order.refund.amount)}</Row>}
              </dl>
            </CardContent>
          </Card>

          <Card className="order-3">
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-3">
                {history.map((h, i) => (
                  <li key={`${h.at}-${i}`} className="border-l-2 pl-3 text-sm">
                    <div className="font-medium">{h.title}</div>
                    {h.lines.map((l, j) => (
                      <div key={j} className="text-muted-foreground">
                        {l}
                      </div>
                    ))}
                    <div className="text-muted-foreground text-xs">
                      {dhakaTime(h.at, now)}
                      {h.by && ` · ${h.by}`}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="order-2 grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div>
                <div className="font-medium">{order.customer.name}</div>
                {order.customer.email && <div className="text-muted-foreground">{order.customer.email}</div>}
              </div>
              <Button asChild variant="secondary" className="justify-start">
                <a href={telHref(order.customer.phone)}>
                  <Phone className="size-4" aria-hidden /> Call {showPhone(order.customer.phone)}
                </a>
              </Button>
              {others.block && (
                <p className="rounded-md border border-red-500/40 bg-red-500/10 p-2">
                  <Badge variant="destructive" className="mr-1">
                    {BLOCK_KIND_NAMES[others.block.kind]}
                  </Badge>
                  {others.block.reason}
                </p>
              )}
              <div>
                <div className="text-muted-foreground mb-1">
                  {others.orders === 0
                    ? "First order on this number."
                    : `${others.orders} other order${others.orders === 1 ? "" : "s"} on this number:`}
                </div>
                {others.orders > 0 && (
                  <>
                    <p className="text-xs">
                      {Object.entries(others.byStatus)
                        .map(([s, n]) => `${n} ${ORDER_STATUS_NAMES[s as OrderStatus].toLowerCase()}`)
                        .join(", ")}
                    </p>
                    <ul className="mt-1 grid gap-0.5">
                      {others.recent.map((r) => (
                        <li key={r.orderNo} className="flex justify-between gap-2 text-xs">
                          <Link href={`/admin/orders/${r.orderNo}`} className="underline underline-offset-2">
                            {r.orderNo}
                          </Link>
                          <span className="text-muted-foreground">
                            {ORDER_STATUS_NAMES[r.status]} · {formatTaka(r.total)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p>{order.address.line}</p>
              <p>
                {order.address.area}, {order.address.district}
              </p>
              <p className="text-muted-foreground">{order.zoneName}</p>
              {order.address.note && <p className="mt-2 rounded-md border p-2">Note: {order.address.note}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>{PAYMENT_METHOD_NAMES[order.paymentMethod] ?? order.paymentMethod}</p>
                <PaymentBadge status={order.paymentStatus} />
              </div>
              {a ? (
                <dl className="grid gap-1.5">
                  <Row label="Wallet">{WALLET_NAMES[a.method]}</Row>
                  <Row label="Amount">{formatTaka(a.amount)}</Row>
                  <Row label="TrxID">
                    <span className="font-mono">{a.trxId}</span>
                  </Row>
                  <Row label="Sent from">
                    <span className="font-mono">{a.senderNumber.replace(/^\+88/, "")}</span>
                  </Row>
                  <Row label="Checked">
                    {a.status === "verified" && a.verifiedAt
                      ? `${a.verifiedByName}, ${dhakaTime(a.verifiedAt, now)}`
                      : a.status === "not_found"
                        ? "Never arrived"
                        : "Not yet"}
                  </Row>
                </dl>
              ) : (
                <p className="text-muted-foreground">Nothing paid in advance.</p>
              )}
              {order.codCollected > 0 && <Row label="Collected at the door">{formatTaka(order.codCollected)}</Row>}
              {order.refund && (
                <p className="rounded-md border p-2">
                  Refunded {formatTaka(order.refund.amount)}: {order.refund.note}
                  <span className="text-muted-foreground block text-xs">
                    {order.refund.byName}, {dhakaTime(order.refund.at, now)}
                  </span>
                </p>
              )}
              {canRefund(order) && permissions.has("orders.refund") && received > 0 && (
                <RefundButton orderNo={order.orderNo} rev={order.rev} received={received} />
              )}
            </CardContent>
          </Card>

          {invoice && (
            <InvoiceCard
              orderNo={order.orderNo}
              invoice={invoice}
              issued={dhakaTime(invoice.issuedAt, now)}
              expires={dhakaTime(invoice.expiresAt, now)}
              canWrite={mayUpdate}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle>Risk</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <RiskBadge level={order.risk.level} score={order.risk.score} />
              {order.risk.reasons.length > 0 ? (
                <ul className="list-disc pl-5">
                  {order.risk.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Nothing unusual.</p>
              )}
              {order.ip && <p className="text-muted-foreground text-xs">Placed from {order.ip}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Calls</CardTitle>
            </CardHeader>
            <CardContent>
              <CallLog orderNo={order.orderNo} calls={order.callLog} canWrite={mayUpdate} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Notes orderNo={order.orderNo} notes={order.notes} canWrite={mayUpdate} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
