import Link from "next/link";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { PurchaseBatchForm, StockTable } from "@/components/admin/catalog/inventory-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/modules/auth/session";
import { listInventory, listMovements, listPurchaseBatches, variantOptions } from "@/modules/catalog/inventory";

// Reads tab and filters from the URL on every request.
export const instant = false;

const TABS = [
  { id: "stock", label: "Stock" },
  { id: "history", label: "History" },
  { id: "batches", label: "Purchase batches" },
] as const;

const REASON: Record<string, string> = {
  purchase: "Purchase",
  order: "Order",
  cancel: "Order cancelled",
  return: "Return",
  adjust: "Correction",
  damage: "Damaged / lost",
};

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function InventoryPage({ searchParams }: PageProps<"/admin/inventory">) {
  const { permissions } = await requireStaff("products.view");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === one(sp.tab)) ? one(sp.tab)! : "stock";
  const q = one(sp.q) ?? "";
  const low = one(sp.low) === "1";
  const canAdjust = permissions.has("inventory.edit");
  // Landed cost and profit are for managers and owners only.
  const showCost = permissions.has("reports.view");

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Inventory"
        description="Stock per variant, every change recorded, and purchase batches with landed cost."
      />
      <nav className="flex gap-1 border-b" aria-label="Inventory sections">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin/inventory${t.id === "stock" ? "" : `?tab=${t.id}`}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              tab === t.id
                ? "border-primary font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "stock" && <StockTab q={q} low={low} canAdjust={canAdjust} showCost={showCost} />}
      {tab === "history" && <HistoryTab variantId={one(sp.variant)} showCost={showCost} />}
      {tab === "batches" && <BatchesTab canAdjust={canAdjust} showCost={showCost} />}
    </div>
  );
}

async function StockTab({
  q,
  low,
  canAdjust,
  showCost,
}: {
  q: string;
  low: boolean;
  canAdjust: boolean;
  showCost: boolean;
}) {
  const all = await listInventory({ q, lowOnly: low });
  const rows = showCost ? all : all.map((r) => ({ ...r, costPrice: 0 }));
  return (
    <div className="grid gap-4">
      <form className="flex flex-wrap items-center gap-2" role="search">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search product or SKU"
          className="max-w-xs"
          aria-label="Search stock"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="low" value="1" defaultChecked={low} /> Low stock only
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      <StockTable rows={rows} canAdjust={canAdjust} showCost={showCost} />
    </div>
  );
}

async function HistoryTab({ variantId, showCost }: { variantId?: string; showCost: boolean }) {
  const all = await listMovements({ variantId, limit: 200 });
  const rows = showCost ? all : all.map((m) => ({ ...m, costPerUnit: null }));
  return (
    <div className="grid gap-3">
      {variantId && (
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/inventory?tab=history">Show all variants</Link>
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          No stock changes yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Stock after</TableHead>
                {showCost && <TableHead className="text-right">Unit cost</TableHead>}
                <TableHead>Note / ref</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{new Date(m.createdAt).toLocaleString("en-GB")}</TableCell>
                  <TableCell className="font-mono text-xs">{m.sku}</TableCell>
                  <TableCell>{REASON[m.reason] ?? m.reason}</TableCell>
                  <TableCell
                    className={cn("text-right tabular-nums", m.change > 0 ? "text-success" : "text-destructive")}
                  >
                    {m.change > 0 ? `+${m.change}` : m.change}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{m.stockAfter}</TableCell>
                  {showCost && (
                    <TableCell className="text-right tabular-nums">
                      {m.costPerUnit != null ? formatTaka(m.costPerUnit) : "—"}
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground text-xs">
                    {[m.refId, m.note].filter(Boolean).join(" · ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

async function BatchesTab({ canAdjust, showCost }: { canAdjust: boolean; showCost: boolean }) {
  const [batches, variants] = await Promise.all([
    showCost ? listPurchaseBatches() : Promise.resolve([]),
    canAdjust ? variantOptions() : Promise.resolve([]),
  ]);
  return (
    <div className="grid gap-6">
      {canAdjust && (
        <Card>
          <CardHeader>
            <CardTitle>Receive a purchase batch</CardTitle>
            <CardDescription>
              Adds stock and records what the goods really cost you, including shipping and customs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PurchaseBatchForm variants={variants} />
          </CardContent>
        </Card>
      )}
      {!showCost ? (
        <p className="text-muted-foreground text-sm">Purchase costs are visible to managers and owners.</p>
      ) : batches.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          No purchase batches yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Goods</TableHead>
                <TableHead className="text-right">Landed total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/admin/inventory?tab=history`} className="hover:underline">
                      {b.batchNo}
                    </Link>
                  </TableCell>
                  <TableCell>{new Date(b.receivedAt).toLocaleDateString("en-GB")}</TableCell>
                  <TableCell>{b.supplier || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {b.units} <span className="text-muted-foreground text-xs">({b.itemCount} items)</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatTaka(b.goodsTotal)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatTaka(b.landedTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
