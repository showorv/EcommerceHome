"use client";

import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatTaka } from "@/lib/money";
import { adjustStockAction, recordPurchaseBatchAction } from "@/modules/catalog/actions";
import type { InventoryRow } from "@/modules/catalog/inventory";
import { allocateLandedCost } from "@/modules/catalog/logic";
import { Field, poishaToInput, report, selectClass, TakaInput } from "./form-bits";

// ---------- Stock table + adjust dialog ----------

export function StockTable({
  rows,
  canAdjust,
  showCost,
}: {
  rows: InventoryRow[];
  canAdjust: boolean;
  showCost: boolean;
}) {
  const [target, setTarget] = useState<InventoryRow | null>(null);
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<"adjust" | "damage" | "return">("adjust");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const newStock = target ? target.stock + (direction === "add" ? 1 : -1) * (Number(qty) || 0) : 0;

  function open(r: InventoryRow) {
    setTarget(r);
    setDirection("add");
    setQty("");
    setReason("adjust");
    setNote("");
  }

  function submit() {
    if (!target) return;
    const n = Number(qty);
    start(async () => {
      const res = await adjustStockAction({
        variantId: target.variantId,
        change: direction === "add" ? n : -n,
        reason,
        note,
      });
      if (report(res)) setTarget(null);
    });
  }

  if (rows.length === 0)
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">Nothing to show.</p>
    );

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">In stock</TableHead>
              <TableHead className="text-right">Reserved</TableHead>
              <TableHead className="text-right">Available</TableHead>
              {showCost && <TableHead className="text-right">Avg. cost</TableHead>}
              <TableHead className="text-right">Price</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.variantId} className={r.active ? "" : "opacity-60"}>
                <TableCell>
                  <Link href={`/admin/products/${r.productId}`} className="font-medium hover:underline">
                    {r.productTitle}
                  </Link>
                  {r.variantTitle && <div className="text-muted-foreground text-xs">{r.variantTitle}</div>}
                </TableCell>
                <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                <TableCell className="text-right tabular-nums">{r.stock}</TableCell>
                <TableCell className="text-right tabular-nums">{r.reserved}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.available <= 0 ? (
                    <Badge variant="destructive">Out</Badge>
                  ) : r.low ? (
                    <Badge variant="outline" className="border-warning text-warning">
                      {r.available} low
                    </Badge>
                  ) : (
                    r.available
                  )}
                </TableCell>
                {showCost && (
                  <TableCell className="text-right tabular-nums">
                    {r.costPrice ? formatTaka(r.costPrice) : "—"}
                  </TableCell>
                )}
                <TableCell className="text-right tabular-nums">{formatTaka(r.price)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/admin/inventory?tab=history&variant=${r.variantId}`}>History</Link>
                  </Button>
                  {canAdjust && (
                    <Button variant="outline" size="sm" onClick={() => open(r)}>
                      <SlidersHorizontal className="size-4" aria-hidden /> Adjust
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
            <DialogDescription>
              {target?.productTitle}
              {target?.variantTitle ? ` — ${target.variantTitle}` : ""} · {target?.sku} · now {target?.stock}
            </DialogDescription>
          </DialogHeader>
          <form
            id="adjust-form"
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Change" htmlFor="adj-dir">
                <select
                  id="adj-dir"
                  className={selectClass}
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as "add" | "remove")}
                >
                  <option value="add">Add (+)</option>
                  <option value="remove">Remove (−)</option>
                </select>
              </Field>
              <Field label="Quantity" htmlFor="adj-qty">
                <Input
                  id="adj-qty"
                  inputMode="numeric"
                  required
                  value={qty}
                  onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
            </div>
            <Field label="Reason" htmlFor="adj-reason">
              <select
                id="adj-reason"
                className={selectClass}
                value={reason}
                onChange={(e) => setReason(e.target.value as typeof reason)}
              >
                <option value="adjust">Stock count correction</option>
                <option value="damage">Damaged / lost</option>
                <option value="return">Customer return</option>
              </select>
            </Field>
            <Field label="Note" htmlFor="adj-note" hint="Optional, saved in the history">
              <Textarea id="adj-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {target && Number(qty) > 0 && (
              <p className={newStock < 0 ? "text-destructive text-sm" : "text-sm"} role="status">
                {newStock < 0 ? (
                  `Only ${target.stock} in stock — you can remove at most ${target.stock}.`
                ) : (
                  <>
                    New stock: <strong>{newStock}</strong>
                  </>
                )}
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              New stock from a supplier? Use a purchase batch so the landed cost is recorded.
            </p>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" form="adjust-form" disabled={pending || !Number(qty) || newStock < 0}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------- Purchase batch form ----------

type Line = { key: string; variantId: string; qty: string; unitCost: string };
const lineKey = () => Math.random().toString(36).slice(2, 9);

export function PurchaseBatchForm({ variants }: { variants: { id: string; label: string; costPrice: number }[] }) {
  // Local date (Bangladesh), not UTC — toISOString() would show yesterday before 6 am.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [supplier, setSupplier] = useState("");
  const [receivedAt, setReceivedAt] = useState(today);
  const [shipping, setShipping] = useState("");
  const [customs, setCustoms] = useState("");
  const [other, setOther] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: lineKey(), variantId: "", qty: "", unitCost: "" }]);
  const [pending, start] = useTransition();

  const p = (v: string) => Math.round((Number(v) || 0) * 100);
  const valid = lines.filter((l) => l.variantId && Number(l.qty) > 0);
  const extra = p(shipping) + p(customs) + p(other);
  const preview = allocateLandedCost(
    valid.map((l) => ({ qty: Number(l.qty), unitCost: p(l.unitCost) })),
    extra,
  );
  const goods = valid.reduce((a, l) => a + Number(l.qty) * p(l.unitCost), 0);
  const setLine = (k: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  function submit() {
    start(async () => {
      const res = await recordPurchaseBatchAction({
        supplier,
        receivedAt,
        shippingCost: shipping || "0",
        customsCost: customs || "0",
        otherCost: other || "0",
        note,
        items: valid.map((l) => ({ variantId: l.variantId, qty: l.qty, unitCost: l.unitCost || "0" })),
      });
      if (report(res)) {
        setLines([{ key: lineKey(), variantId: "", qty: "", unitCost: "" }]);
        setShipping("");
        setCustoms("");
        setOther("");
        setNote("");
        setSupplier("");
      }
    });
  }

  if (variants.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        Add a product first.{" "}
        <Link href="/admin/products/new" className="underline">
          Add product
        </Link>
      </p>
    );

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Supplier" htmlFor="pb-supplier">
          <Input
            id="pb-supplier"
            placeholder="e.g. Yiwu supplier / 1688 shop"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          />
        </Field>
        <Field label="Received on" htmlFor="pb-date">
          <Input
            id="pb-date"
            type="date"
            max={today}
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-2">
        <div className="text-sm font-medium">Items</div>
        {lines.map((l, i) => {
          const landed = valid.indexOf(l) >= 0 ? preview[valid.indexOf(l)] : undefined;
          return (
            <div
              key={l.key}
              className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_90px_130px_auto] sm:items-center"
            >
              <select
                aria-label={`Item ${i + 1} variant`}
                className={selectClass}
                value={l.variantId}
                onChange={(e) => {
                  const v = variants.find((x) => x.id === e.target.value);
                  setLine(l.key, {
                    variantId: e.target.value,
                    unitCost: l.unitCost || (v?.costPrice ? poishaToInput(v.costPrice) : ""),
                  });
                }}
              >
                <option value="">Choose product / variant…</option>
                {variants
                  .filter((v) => v.id === l.variantId || !lines.some((x) => x.variantId === v.id))
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
              </select>
              <Input
                aria-label={`Item ${i + 1} quantity`}
                placeholder="Qty"
                inputMode="numeric"
                value={l.qty}
                onChange={(e) => setLine(l.key, { qty: e.target.value.replace(/\D/g, "") })}
              />
              <TakaInput
                placeholder="Unit cost"
                value={l.unitCost}
                onChange={(unitCost) => setLine(l.key, { unitCost })}
              />
              <div className="flex items-center justify-between gap-2 sm:justify-end">
                {landed && (
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    landed {formatTaka(landed.landedUnitCost)}/unit
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                >
                  <Trash2 className="size-4" aria-hidden />
                  <span className="sr-only">Remove item</span>
                </Button>
              </div>
            </div>
          );
        })}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLines((ls) => [...ls, { key: lineKey(), variantId: "", qty: "", unitCost: "" }])}
          >
            <Plus className="size-4" aria-hidden /> Item
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Shipping / freight" htmlFor="pb-ship">
          <TakaInput id="pb-ship" value={shipping} onChange={setShipping} />
        </Field>
        <Field label="Customs / duty" htmlFor="pb-customs">
          <TakaInput id="pb-customs" value={customs} onChange={setCustoms} />
        </Field>
        <Field label="Other costs" htmlFor="pb-other">
          <TakaInput id="pb-other" value={other} onChange={setOther} />
        </Field>
      </div>
      <Field label="Note" htmlFor="pb-note">
        <Textarea id="pb-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="bg-muted flex flex-wrap items-center justify-between gap-3 rounded-md p-3 text-sm">
        <span>
          Goods {formatTaka(goods)} + extra {formatTaka(extra)} = <strong>landed {formatTaka(goods + extra)}</strong>
        </span>
        <Button type="submit" disabled={pending || valid.length === 0}>
          {pending ? "Saving…" : "Receive stock"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Extra costs are shared across items by value. Each variant&apos;s average cost is updated, so profit reports use
        the real landed cost.
      </p>
    </form>
  );
}
