import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { dhakaTime, RiskBadge, StatusBadge } from "@/components/admin/orders/bits";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTaka } from "@/lib/money";
import { requireStaff } from "@/modules/auth/session";
import {
  dashboardRates,
  PERIOD_NAMES,
  PERIODS,
  periodStart,
  ratePercent,
  readPeriod,
} from "@/modules/dashboard/dashboard";
import { lowStock, orderCounts, outcomes, topProducts, waitingForCall } from "@/modules/dashboard/data";
import { requestTime } from "@/modules/orders/admin-data";

// Checks the signed-in staff member and reads the clock on every request.
export const instant = false;

/**
 * Dashboard (FR-AD-01). Order counts and rates need orders.view; money (order value, delivered value,
 * best sellers' value) needs reports.view; low stock needs products.view.
 */
export default async function AdminDashboardPage({ searchParams }: PageProps<"/admin">) {
  const { user, permissions } = await requireStaff();
  const period = readPeriod((await searchParams).period);
  const from = periodStart(period, await requestTime());
  const seeOrders = permissions.has("orders.view");
  const seeMoney = permissions.has("reports.view");
  const seeStock = permissions.has("products.view");

  const [counts, done, top, waiting, low] = await Promise.all([
    seeOrders ? orderCounts(from) : null,
    seeOrders ? outcomes(from) : null,
    seeOrders ? topProducts(from) : null,
    seeOrders ? waitingForCall() : null,
    seeStock ? lowStock() : null,
  ]);
  const rates = counts && done ? dashboardRates(counts, done) : null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Welcome back, {user.name}.</p>
        </div>
        {seeOrders && (
          <nav className="bg-muted flex rounded-lg p-1 text-sm" aria-label="Period">
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={p === "today" ? "/admin" : `/admin?period=${p}`}
                aria-current={p === period ? "page" : undefined}
                className={`rounded-md px-3 py-1 ${p === period ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {PERIOD_NAMES[p]}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {counts && done && rates && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Orders placed"
            value={String(counts.placed)}
            note={seeMoney ? `${formatTaka(counts.value)} not counting cancelled` : PERIOD_NAMES[period]}
          />
          <Stat
            label="Confirmation rate"
            value={ratePercent(rates.confirmation)}
            note={
              counts.decided > 0
                ? `${counts.confirmed} of ${counts.decided} decided were confirmed`
                : "No orders decided yet"
            }
          />
          <Stat
            label="Delivery success"
            value={ratePercent(rates.deliverySuccess)}
            note={
              seeMoney && done.delivered + done.partial > 0
                ? `${done.delivered + done.partial} delivered · ${formatTaka(done.deliveredValue)}`
                : `${done.delivered + done.partial} delivered`
            }
          />
          <Stat
            label="Returned (RTO)"
            value={ratePercent(rates.rto)}
            note={`${done.returned} came back of ${done.delivered + done.partial + done.returned} at the door`}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {waiting && (
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Waiting for a call</CardTitle>
              <CardDescription>
                {waiting.total === 0
                  ? "Nothing pending or on hold."
                  : `${waiting.total} order${waiting.total === 1 ? "" : "s"} pending or on hold, oldest first.`}
              </CardDescription>
            </CardHeader>
            {waiting.rows.length > 0 && (
              <CardContent>
                <ul className="-mx-2 divide-y">
                  {waiting.rows.map((o) => (
                    <li key={o.orderNo}>
                      <Link
                        href={`/admin/orders/${o.orderNo}`}
                        className="hover:bg-accent/50 grid gap-1 rounded-md px-2 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-medium">{o.orderNo}</span>
                          <StatusBadge status={o.status} />
                          {o.riskLevel !== "low" && <RiskBadge level={o.riskLevel} score={o.riskScore} />}
                          <span className="ml-auto tabular-nums">{formatTaka(o.total)}</span>
                        </div>
                        <div className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
                          <span className="[overflow-wrap:anywhere]">{o.name}</span>
                          <span>{dhakaTime(o.createdAt)}</span>
                          <span>
                            {o.calls === 0
                              ? "Not called yet"
                              : `${o.calls} call${o.calls === 1 ? "" : "s"}: ${o.lastCall}`}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
                {waiting.total > waiting.rows.length && <MoreLink href="/admin/orders">All waiting orders</MoreLink>}
              </CardContent>
            )}
          </Card>
        )}

        {top && (
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Top products</CardTitle>
              <CardDescription>
                By units ordered, {PERIOD_NAMES[period].toLowerCase()}, cancelled left out.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {top.length === 0 ? (
                <p className="text-muted-foreground text-sm">No orders in this period.</p>
              ) : (
                <ol className="grid gap-2 text-sm">
                  {top.map((p, i) => (
                    <li key={p.productId} className="flex items-center gap-3">
                      <span className="text-muted-foreground w-4 text-right tabular-nums">{i + 1}</span>
                      <Link
                        href={`/admin/products/${p.productId}`}
                        className="min-w-0 flex-1 truncate hover:underline"
                        title={p.title}
                      >
                        {p.title}
                      </Link>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {p.units} unit{p.units === 1 ? "" : "s"}
                        {seeMoney && ` · ${formatTaka(p.value)}`}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        )}

        {low && (
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Low stock</CardTitle>
              <CardDescription>
                {low.total === 0
                  ? "Nothing is at or below its low-stock level."
                  : `${low.total} variant${low.total === 1 ? "" : "s"} at or below the low-stock level.`}
              </CardDescription>
            </CardHeader>
            {low.rows.length > 0 && (
              <CardContent>
                <ul className="grid gap-2 text-sm">
                  {low.rows.map((r) => (
                    <li key={r.variantId} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate" title={`${r.productTitle} · ${r.variantTitle}`}>
                        {r.productTitle}
                        {r.variantTitle && <span className="text-muted-foreground"> · {r.variantTitle}</span>}
                      </span>
                      <Badge variant={r.available <= 0 ? "destructive" : "outline"} className="shrink-0 tabular-nums">
                        {r.available <= 0 ? "Out" : `${r.available} left`}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <MoreLink href="/admin/inventory?low=1">Inventory</MoreLink>
              </CardContent>
            )}
          </Card>
        )}
      </div>

      {!seeOrders && !seeStock && (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          Your role has nothing to show on the dashboard yet. Use the menu to get to your work.
        </p>
      )}

      <details className="text-sm">
        <summary className="text-muted-foreground cursor-pointer">Your permissions ({user.role})</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {[...permissions].sort().map((p) => (
            <Badge key={p} variant="outline" className="font-mono">
              {p}
            </Badge>
          ))}
        </div>
      </details>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground px-4 text-xs">{note}</CardContent>
    </Card>
  );
}

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-muted-foreground mt-3 flex w-fit items-center gap-1 text-xs hover:underline">
      {children} <ChevronRight className="size-3" aria-hidden />
    </Link>
  );
}
