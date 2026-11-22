import { Download, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { OrdersTable, type BulkKind } from "@/components/admin/orders/orders-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/modules/auth/session";
import { getDeliveryConfig } from "@/modules/delivery/data";
import { listOrders, requestTime } from "@/modules/orders/admin-data";
import { PAYMENT_STATUS_NAMES, PAYMENT_STATUSES } from "@/modules/orders/orders";
import type { Permission } from "@/modules/auth/rbac";
import { ORDER_TAB_NAMES, ORDER_TABS, orderFiltersQuery, readOrderFilters, TAB_BULK } from "@/modules/orders/staff";

export const metadata: Metadata = { title: "Orders" };

const BULK_PERMISSION: Record<BulkKind, Permission> = {
  confirm: "orders.confirm",
  cancel: "orders.cancel",
  packed: "orders.update",
  shipped: "orders.update",
  delivered: "orders.update",
};

// Reads the signed-in staff member and the URL filters on every request.
export const instant = false;

const selectClass = "bg-background h-9 rounded-md border px-2 text-sm";

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const { permissions } = await requireStaff("orders.view");
  const f = readOrderFilters(await searchParams, PAYMENT_STATUSES);
  const [{ rows, total, pageCount, counts }, config] = await Promise.all([listOrders(f), getDeliveryConfig()]);
  const now = await requestTime();
  const filtered = !!(f.q || f.zoneId || f.payment || f.from || f.to);
  const href = (patch: Partial<typeof f>, page?: number) =>
    `/admin/orders${orderFiltersQuery({ ...f, ...patch }, page)}`;

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Orders"
        description="Call each new order and check any advance, then confirm it. Pack, ship and mark delivered from the tabs."
        actions={
          <>
            {permissions.has("orders.export") && (
              <Button asChild variant="outline">
                <a href={`/admin/orders/export${orderFiltersQuery(f)}`} download>
                  <Download className="size-4" aria-hidden /> Export CSV
                </a>
              </Button>
            )}
            {permissions.has("orders.create") && (
              <Button asChild>
                <Link href="/admin/orders/new">
                  <Plus className="size-4" aria-hidden /> New order
                </Link>
              </Button>
            )}
          </>
        }
      />

      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Order status">
        {ORDER_TABS.map((t) => (
          <Link
            key={t}
            href={href({ tab: t })}
            aria-current={f.tab === t ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap",
              f.tab === t
                ? "border-primary font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {ORDER_TAB_NAMES[t]}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                t === "pending" && counts.pending > 0
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "bg-muted",
              )}
            >
              {counts[t]}
            </span>
          </Link>
        ))}
      </nav>

      <form className="flex flex-wrap items-end gap-2" role="search">
        {f.tab !== "pending" && <input type="hidden" name="tab" value={f.tab} />}
        <Input
          name="q"
          defaultValue={f.q}
          placeholder="Order no, phone or name"
          className="w-full sm:max-w-56"
          aria-label="Search orders"
        />
        <select name="zone" defaultValue={f.zoneId} aria-label="Zone" className={selectClass}>
          <option value="">All zones</option>
          {config.zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <select name="payment" defaultValue={f.payment} aria-label="Payment" className={selectClass}>
          <option value="">Any payment</option>
          {PAYMENT_STATUSES.map((p) => (
            <option key={p} value={p}>
              {PAYMENT_STATUS_NAMES[p]}
            </option>
          ))}
        </select>
        <label className="text-muted-foreground flex items-center gap-1 text-sm">
          From
          <Input type="date" name="from" defaultValue={f.from} className="w-auto" />
        </label>
        <label className="text-muted-foreground flex items-center gap-1 text-sm">
          To
          <Input type="date" name="to" defaultValue={f.to} className="w-auto" />
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {filtered && (
          <Button asChild variant="ghost">
            <Link href={href({ q: "", zoneId: "", payment: "", from: "", to: "" })}>Clear</Link>
          </Button>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          {filtered
            ? "No orders match these filters."
            : f.tab === "pending"
              ? "No orders waiting for a call."
              : f.tab === "confirmed"
                ? "Nothing to pack."
                : f.tab === "packed"
                  ? "Nothing waiting for the courier."
                  : "No orders here yet."}
        </p>
      ) : (
        <OrdersTable
          rows={rows}
          now={now}
          showStatus={f.tab === "all" || f.tab === "delivered"}
          actions={(TAB_BULK[f.tab] ?? []).filter((a) => permissions.has(BULK_PERMISSION[a]))}
        />
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="Pages">
          {f.page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={href({}, f.page - 1)}>Previous</Link>
            </Button>
          )}
          <span className="text-muted-foreground text-sm">
            Page {f.page} of {pageCount} · {total} orders
          </span>
          {f.page < pageCount && (
            <Button asChild variant="outline" size="sm">
              <Link href={href({}, f.page + 1)}>Next</Link>
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}
