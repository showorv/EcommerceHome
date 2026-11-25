"use client";

import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Field, poishaToInput, report, selectClass, TakaInput } from "@/components/admin/catalog/form-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatTaka } from "@/lib/money";
import { deliveryQuote, type DeliveryRules, type Zone } from "@/modules/delivery/charge";
import type { VariantOption } from "@/modules/orders/admin-data";
import { editOrderAction, searchVariantsAction } from "@/modules/orders/admin-actions";
import type { OrderItem } from "@/modules/orders/orders";
import { editedTotals, type AdminOrder } from "@/modules/orders/staff";

type Line = Pick<OrderItem, "variantId" | "productId" | "title" | "variantTitle" | "sku" | "price" | "weightGrams"> & {
  qty: number;
  image: string | null;
  /** Free to add (new lines only; existing lines already hold theirs). */
  available?: number;
  added?: boolean;
};

const toTaka = (s: string) => Math.round((Number(s) || 0) * 100);

export function OrderEditor({
  order,
  districts,
  areas,
  districtZones,
  zones,
  rules,
}: {
  order: AdminOrder;
  districts: { id: string; name: string }[];
  areas: { id: string; name: string; districtId: string; zoneId: string | null }[];
  districtZones: Record<string, string | null>;
  zones: Zone[];
  rules: DeliveryRules;
}) {
  const router = useRouter();
  const [name, setName] = useState(order.customer.name);
  const [phone, setPhone] = useState(order.customer.phone.replace(/^\+88/, ""));
  const [email, setEmail] = useState(order.customer.email);
  const [districtId, setDistrictId] = useState(order.address.districtId);
  const [areaId, setAreaId] = useState(order.address.areaId);
  const [address, setAddress] = useState(order.address.line);
  const [note, setNote] = useState(order.address.note);
  const [lines, setLines] = useState<Line[]>(order.items);
  const [discount, setDiscount] = useState(poishaToInput(order.discount) || "0");
  const [delivery, setDelivery] = useState(poishaToInput(order.deliveryCharge) || "0");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const areaList = areas.filter((a) => a.districtId === districtId);
  const area = areas.find((a) => a.id === areaId && a.districtId === districtId);
  const zoneId = area ? (area.zoneId ?? districtZones[districtId] ?? null) : null;
  const zone = zones.find((z) => z.id === zoneId) ?? null;

  const totals = editedTotals({
    items: lines,
    discount: toTaka(discount),
    deliveryCharge: toTaka(delivery),
    codFeePercent: zone?.codFeePercent ?? 0,
    advancePaid: order.advance?.amount ?? 0,
  });
  // What the zone would charge today for this weight, as a suggestion (staff decide).
  const suggested = zone
    ? deliveryQuote({
        zone,
        rules,
        lines,
        subtotal: totals.subtotal - totals.discount,
        now: Date.parse(order.createdAt),
      }).charge
    : null;

  const setQty = (variantId: string, qty: number) =>
    setLines((ls) => ls.map((l) => (l.variantId === variantId ? { ...l, qty: Math.min(99, Math.max(1, qty)) } : l)));
  const remove = (variantId: string) => setLines((ls) => ls.filter((l) => l.variantId !== variantId));
  const add = (v: VariantOption) =>
    setLines((ls) =>
      ls.some((l) => l.variantId === v.variantId)
        ? ls.map((l) => (l.variantId === v.variantId ? { ...l, qty: Math.min(99, l.qty + 1) } : l))
        : [...ls, { ...v, qty: 1, added: true }],
    );

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await editOrderAction({
        orderNo: order.orderNo,
        rev: order.rev,
        name,
        phone,
        email,
        districtId,
        areaId,
        address,
        note,
        items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
        discount,
        deliveryCharge: delivery,
        reason,
      });
      if (report(res)) router.push(`/admin/orders/${order.orderNo}`);
    });
  }

  return (
    <form onSubmit={save} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid content-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
            <CardDescription>Change quantities, remove items or add products.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ul className="grid gap-3">
              {lines.map((l) => (
                <li key={l.variantId} className="flex flex-wrap items-center gap-3 border-b pb-3 last:border-b-0">
                  {l.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail
                    <img src={l.image} alt="" className="bg-muted size-10 rounded-md object-cover" />
                  ) : (
                    <div className="bg-muted size-10 rounded-md" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{l.title}</div>
                    <div className="text-muted-foreground text-xs">
                      {[l.variantTitle, l.sku, formatTaka(l.price)].filter(Boolean).join(" · ")}
                      {l.added && l.available !== undefined && ` · ${l.available} free`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setQty(l.variantId, l.qty - 1)}
                      disabled={l.qty <= 1}
                      aria-label={`One less ${l.title}`}
                    >
                      <Minus className="size-4" aria-hidden />
                    </Button>
                    <Input
                      className="w-14 text-center tabular-nums"
                      inputMode="numeric"
                      aria-label={`Quantity of ${l.title} ${l.variantTitle}`}
                      value={l.qty}
                      onChange={(e) => setQty(l.variantId, Number(e.target.value.replace(/\D/g, "")) || 1)}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setQty(l.variantId, l.qty + 1)}
                      aria-label={`One more ${l.title}`}
                    >
                      <Plus className="size-4" aria-hidden />
                    </Button>
                  </div>
                  <div className="w-20 text-right tabular-nums">{formatTaka(l.price * l.qty)}</div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => remove(l.variantId)}
                    disabled={lines.length === 1}
                    aria-label={`Remove ${l.title} ${l.variantTitle}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            <ProductSearch onAdd={add} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer and address</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="edit-name">
              <Input id="edit-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Mobile number" htmlFor="edit-phone">
              <Input
                id="edit-phone"
                type="tel"
                inputMode="tel"
                maxLength={18}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </Field>
            <Field label="Email (optional)" htmlFor="edit-email" className="sm:col-span-2">
              <Input
                id="edit-email"
                type="email"
                maxLength={120}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="District" htmlFor="edit-district">
              <select
                id="edit-district"
                className={selectClass}
                value={districtId}
                onChange={(e) => {
                  setDistrictId(e.target.value);
                  setAreaId("");
                }}
              >
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Area / thana"
              htmlFor="edit-area"
              hint={zone ? `Zone: ${zone.name}` : areaId ? "This area has no delivery zone." : undefined}
            >
              <select id="edit-area" className={selectClass} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                <option value="">Choose an area</option>
                {areaList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Full address" htmlFor="edit-address" className="sm:col-span-2">
              <Textarea
                id="edit-address"
                rows={2}
                maxLength={300}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </Field>
            <Field label="Delivery note (optional)" htmlFor="edit-note" className="sm:col-span-2">
              <Input id="edit-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="grid content-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Amounts</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field
              label="Discount"
              htmlFor="edit-discount"
              hint={order.couponCode ? `Coupon ${order.couponCode} gave ${formatTaka(order.discount)}.` : undefined}
            >
              <TakaInput id="edit-discount" value={discount} onChange={setDiscount} />
            </Field>
            <Field
              label="Delivery charge"
              htmlFor="edit-delivery"
              hint={
                suggested !== null && suggested !== toTaka(delivery) ? (
                  <>
                    {zone?.name} charges {formatTaka(suggested)} for this order.{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => setDelivery(poishaToInput(suggested) || "0")}
                    >
                      Use it
                    </button>
                  </>
                ) : undefined
              }
            >
              <TakaInput id="edit-delivery" value={delivery} onChange={setDelivery} />
            </Field>
            <dl className="grid gap-1.5 border-t pt-3 text-sm">
              <Money label="Subtotal" value={totals.subtotal} />
              {totals.discount > 0 && <Money label="Discount" value={-totals.discount} />}
              <Money label="Delivery" value={totals.deliveryCharge} />
              {totals.codFee > 0 && <Money label="COD fee" value={totals.codFee} />}
              <div className="flex justify-between font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatTaka(totals.total)}</dd>
              </div>
              {totals.advancePaid > 0 && <Money label="Advance already sent" value={-totals.advancePaid} />}
              <Money label="To collect at the door" value={totals.codAmount} />
              {totals.total !== order.total && (
                <p className="text-muted-foreground text-xs">Was {formatTaka(order.total)}.</p>
              )}
            </dl>
            {totals.overpaid > 0 && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm" role="status">
                The advance is {formatTaka(totals.overpaid)} more than the new total. Refund the difference from your
                wallet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3 pt-6">
            <Field label="Why (optional)" htmlFor="edit-reason" hint="Saved with the changes.">
              <Input
                id="edit-reason"
                maxLength={300}
                placeholder="e.g. Customer asked for 2 instead of 1"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={pending || !areaId}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push(`/admin/orders/${order.orderNo}`)}>
              Discard
            </Button>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function Money({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value < 0 ? `−${formatTaka(-value)}` : formatTaka(value)}</dd>
    </div>
  );
}

export function ProductSearch({ onAdd }: { onAdd: (v: VariantOption) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; rows: VariantOption[] } | null>(null);
  const query = q.trim();

  useEffect(() => {
    if (query.length < 2) return;
    let live = true;
    const t = setTimeout(async () => {
      const rows = await searchVariantsAction(query).catch(() => []);
      if (live) setFound({ q: query, rows });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  const rows = useMemo(() => (found && found.q === query ? found.rows : null), [found, query]);

  return (
    <div className="grid gap-2 border-t pt-4">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          className="pl-8"
          placeholder="Add a product: search by name or SKU"
          aria-label="Search products to add"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        />
      </div>
      {query.length >= 2 && rows && (
        <ul className="grid max-h-72 gap-1 overflow-y-auto rounded-md border p-1">
          {rows.length === 0 && <li className="text-muted-foreground p-2 text-sm">Nothing found.</li>}
          {rows.map((v) => (
            <li key={v.variantId} className="hover:bg-muted flex items-center gap-3 rounded p-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {v.title}
                  {v.variantTitle && <span className="text-muted-foreground font-normal"> · {v.variantTitle}</span>}
                </div>
                <div className="text-muted-foreground text-xs">
                  {v.sku} · {formatTaka(v.price)} · {v.available > 0 ? `${v.available} free` : "None free"}
                </div>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => onAdd(v)}>
                Add
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
