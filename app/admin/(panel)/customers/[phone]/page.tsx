import { ArrowLeft, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { CustomerBlock } from "@/components/admin/customers/customer-block";
import { dhakaTime, PaymentBadge, StatusBadge, telHref } from "@/components/admin/orders/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTaka } from "@/lib/money";
import { requireStaff } from "@/modules/auth/session";
import { CUSTOMER_ORDERS_SHOWN, getCustomer } from "@/modules/customers/admin-data";
import { localPhone, percent, phoneFromParam, returnRate } from "@/modules/customers/stats";

export const metadata: Metadata = { title: "Customer" };

// Reads the signed-in staff member on every request; a different page for every number.
export const instant = false;

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Dhaka",
});
const day = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : "—");

/** One customer (FR-AD-06): profile, order history, lifetime value, return rate, block or flag. */
export default async function CustomerPage({ params }: PageProps<"/admin/customers/[phone]">) {
  const { permissions } = await requireStaff("customers.view");
  const phone = phoneFromParam((await params).phone);
  if (!phone) notFound();
  const c = await getCustomer(phone);
  if (!c) notFound();
  const s = c.stats;
  const name = c.names[0]?.name || c.accounts[0]?.name || localPhone(phone);

  return (
    <div className="grid gap-5">
      <Link
        href="/admin/customers"
        className="text-muted-foreground flex w-fit items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> All customers
      </Link>
      <PageHeader
        title={name}
        description={`${localPhone(phone)} · first order ${day(s.firstOrderAt)} · last order ${day(s.lastOrderAt)}`}
        actions={
          <Button asChild variant="secondary">
            <a href={telHref(phone)}>
              <Phone className="size-4" aria-hidden /> Call {localPhone(phone)}
            </a>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Lifetime value" value={formatTaka(s.value)} note="Delivered orders, less refunds" />
        <Stat label="Orders" value={String(s.orders)} note={s.open > 0 ? `${s.open} still open` : "None open"} />
        <Stat
          label="Delivered"
          value={String(s.delivered + s.partial)}
          note={s.partial > 0 ? `${s.partial} of them in part` : `${s.cancelled} cancelled`}
        />
        <Stat
          label="Return rate"
          value={percent(returnRate(s))}
          note={`${s.returned} returned of ${s.delivered + s.partial + s.returned} at the door`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Orders</CardTitle>
            <CardDescription>
              Newest first{s.orders > CUSTOMER_ORDERS_SHOWN ? `, the latest ${CUSTOMER_ORDERS_SHOWN}` : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {c.orders.length === 0 ? (
              <p className="text-muted-foreground text-sm">No orders on this number.</p>
            ) : (
              <ul className="-mx-2 divide-y">
                {c.orders.map((o) => (
                  <li key={o.orderNo}>
                    <Link
                      href={`/admin/orders/${o.orderNo}`}
                      className="hover:bg-accent/50 grid gap-1 rounded-md px-2 py-2.5 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-medium">{o.orderNo}</span>
                        <StatusBadge status={o.status} />
                        <PaymentBadge status={o.paymentStatus} />
                        <span className="ml-auto font-medium tabular-nums">{formatTaka(o.total)}</span>
                      </div>
                      <div className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
                        <span>{dhakaTime(o.createdAt)}</span>
                        <span className="[overflow-wrap:anywhere]">
                          {o.firstItem} · {o.itemCount} item{o.itemCount === 1 ? "" : "s"}
                        </span>
                        {o.name !== name && <span>as “{o.name}”</span>}
                        {o.place && <span>{o.place}</span>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Blocked or flagged</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerBlock phone={phone} entry={c.block} canChange={permissions.has("customers.block")} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <Facts title="Names used">
                {c.names.map((n) => (
                  <li key={n.name} className="flex justify-between gap-2">
                    <span className="[overflow-wrap:anywhere]">{n.name}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">{n.orders}×</span>
                  </li>
                ))}
              </Facts>
              <Facts title="Emails">
                {c.emails.map((e) => (
                  <li key={e} className="[overflow-wrap:anywhere]">
                    {e}
                  </li>
                ))}
              </Facts>
              <Facts title="Delivered to">
                {c.places.map((p) => (
                  <li key={p.place} className="flex justify-between gap-2">
                    <span>{p.place}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">{p.orders}×</span>
                  </li>
                ))}
              </Facts>
              <Facts title="Account">
                {c.accounts.map((a) => (
                  <li key={a.id} className="grid gap-0.5">
                    <span className="[overflow-wrap:anywhere]">
                      {a.name} {a.phoneMatches && <Badge variant="secondary">Number confirmed</Badge>}
                    </span>
                    <span className="text-muted-foreground text-xs [overflow-wrap:anywhere]">
                      {a.email}
                      {a.email && (a.emailVerified ? " · confirmed" : " · not confirmed")} · joined {day(a.createdAt)}
                    </span>
                  </li>
                ))}
              </Facts>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl tabular-nums sm:text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground px-4 text-xs">{note}</CardContent>
    </Card>
  );
}

function Facts({ title, children }: { title: string; children: React.ReactNode[] }) {
  return (
    <div className="grid gap-1">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</h3>
      {children.length > 0 ? <ul className="grid gap-1">{children}</ul> : <p className="text-muted-foreground">—</p>}
    </div>
  );
}
