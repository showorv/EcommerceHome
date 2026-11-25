import { ChevronRight, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatTaka } from "@/lib/money";
import { requireStaff } from "@/modules/auth/session";
import { listCustomers } from "@/modules/customers/admin-data";
import { BLOCK_KIND_NAMES } from "@/modules/customers/blocks";
import {
  CUSTOMER_SHOW_NAMES,
  CUSTOMER_SHOWS,
  CUSTOMER_SORT_NAMES,
  CUSTOMER_SORTS,
  customerFiltersQuery,
  customerHref,
  localPhone,
  percent,
  readCustomerFilters,
  returnRate,
} from "@/modules/customers/stats";

export const metadata: Metadata = { title: "Customers" };

// Reads the signed-in staff member and the URL filters on every request.
export const instant = false;

const selectClass = "bg-background h-9 rounded-md border px-2 text-sm";
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Dhaka",
});

/** Customers (FR-AD-06): one row per mobile number, from the orders. */
export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  await requireStaff("customers.view");
  const f = readCustomerFilters(await searchParams);
  const { rows, total, pageCount, totals } = await listCustomers(f);
  const href = (page: number) => `/admin/customers${customerFiltersQuery(f, page)}`;

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Customers"
        description="Everyone who has ordered, by mobile number (guests included). Open one to see their orders, what they've spent and their returns, and to block or flag the number."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Customers who ordered" value={totals.customers} />
        <Stat label="Ordered 2 or more times" value={totals.repeat} />
        <Stat label="Customer accounts" value={totals.accounts} />
      </div>

      <form className="flex flex-wrap items-end gap-2" action="/admin/customers">
        <div className="grid min-w-0 flex-1 basis-56 gap-1">
          <label htmlFor="cu-q" className="text-muted-foreground text-xs">
            Search
          </label>
          <Input id="cu-q" name="q" defaultValue={f.q} placeholder="Name or mobile number" maxLength={60} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="cu-show" className="text-muted-foreground text-xs">
            Show
          </label>
          <select id="cu-show" name="show" defaultValue={f.show} className={selectClass}>
            {CUSTOMER_SHOWS.map((s) => (
              <option key={s} value={s}>
                {CUSTOMER_SHOW_NAMES[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="cu-sort" className="text-muted-foreground text-xs">
            Sort by
          </label>
          <select id="cu-sort" name="sort" defaultValue={f.sort} className={selectClass}>
            {CUSTOMER_SORTS.map((s) => (
              <option key={s} value={s}>
                {CUSTOMER_SORT_NAMES[s]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {(f.q || f.show !== "all" || f.sort !== "recent") && (
          <Button asChild variant="ghost">
            <Link href="/admin/customers">Clear</Link>
          </Button>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {f.q || f.show !== "all" ? "No customers match." : "No orders yet, so no customers yet."}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((r) => (
            <li key={r.phone}>
              <Link
                href={customerHref(r.phone)}
                className="hover:bg-accent/50 flex items-center gap-3 px-3 py-3 sm:px-4"
              >
                <div className="grid min-w-0 flex-1 gap-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium [overflow-wrap:anywhere]">{r.name || "—"}</span>
                    {r.otherNames > 0 && (
                      <span className="text-muted-foreground text-xs">
                        +{r.otherNames} other name{r.otherNames === 1 ? "" : "s"}
                      </span>
                    )}
                    {r.block && (
                      <Badge variant={r.block === "block" ? "destructive" : "outline"}>
                        {BLOCK_KIND_NAMES[r.block]}
                      </Badge>
                    )}
                    {r.hasAccount && (
                      <Badge variant="secondary" className="gap-1">
                        <UserRound className="size-3" aria-hidden /> Account
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    <span className="font-mono">{localPhone(r.phone)}</span>
                    <span>
                      {r.orders} order{r.orders === 1 ? "" : "s"}
                      {r.open > 0 && ` · ${r.open} open`}
                    </span>
                    <span>Returns {percent(returnRate(r))}</span>
                    {r.lastOrderAt && <span>Last {dateFmt.format(new Date(r.lastOrderAt))}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium tabular-nums">{formatTaka(r.value)}</div>
                  <div className="text-muted-foreground text-xs">spent</div>
                </div>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-between gap-2 text-sm" aria-label="Pages">
          <span className="text-muted-foreground">
            Page {f.page} of {pageCount} · {total} customers
          </span>
          <div className="flex gap-2">
            {f.page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={href(f.page - 1)}>Previous</Link>
              </Button>
            )}
            {f.page < pageCount && (
              <Button asChild variant="outline" size="sm">
                <Link href={href(f.page + 1)}>Next</Link>
              </Button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
