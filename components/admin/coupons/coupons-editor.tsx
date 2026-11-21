"use client";

import { Pencil, Plus, Shuffle, Trash2, X } from "lucide-react";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { Field, poishaToInput, report, selectClass, TakaInput } from "@/components/admin/catalog/form-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatTaka } from "@/lib/money";
import { deleteCouponAction, saveCouponAction, setCouponActiveAction } from "@/modules/coupons/actions";
import {
  COUPON_STATUS_NAMES,
  COUPON_TYPE_NAMES,
  COUPON_TYPES,
  couponStatus,
  describeCoupon,
  type Coupon,
  type CouponStatus,
  type CouponType,
} from "@/modules/coupons/coupons";
import { dhakaInputToIso, isoToDhakaInput } from "@/modules/storefront/sections";

export type PickerProduct = { id: string; title: string; status: string };
export type PickerCategory = { id: string; name: string };

type Form = {
  code: string;
  type: CouponType;
  value: string;
  minOrder: string;
  maxDiscount: string;
  usageLimit: string;
  perCustomerLimit: string;
  startsAt: string;
  endsAt: string;
  productIds: string[];
  categoryIds: string[];
  active: boolean;
  note: string;
};

const EMPTY: Form = {
  code: "",
  type: "percent",
  value: "",
  minOrder: "",
  maxDiscount: "",
  usageLimit: "",
  perCustomerLimit: "1",
  startsAt: "",
  endsAt: "",
  productIds: [],
  categoryIds: [],
  active: true,
  note: "",
};

function toForm(c: Coupon): Form {
  return {
    code: c.code,
    type: c.type,
    value: c.type === "fixed" ? poishaToInput(c.value) : c.type === "percent" ? String(c.value) : "",
    minOrder: c.minOrder ? poishaToInput(c.minOrder) : "",
    maxDiscount: c.maxDiscount ? poishaToInput(c.maxDiscount) : "",
    usageLimit: c.usageLimit ? String(c.usageLimit) : "",
    perCustomerLimit: String(c.perCustomerLimit),
    startsAt: isoToDhakaInput(c.startsAt),
    endsAt: isoToDhakaInput(c.endsAt),
    productIds: c.productIds,
    categoryIds: c.categoryIds,
    active: c.active,
    note: c.note,
  };
}

function fromForm(f: Form) {
  return {
    ...f,
    value: f.value || "0",
    minOrder: f.minOrder || "0",
    maxDiscount: f.maxDiscount || "0",
    usageLimit: f.usageLimit || "0",
    perCustomerLimit: f.perCustomerLimit || "0",
    startsAt: f.startsAt ? dhakaInputToIso(f.startsAt) : null,
    endsAt: f.endsAt ? dhakaInputToIso(f.endsAt) : null,
  };
}

/** 8 characters without look-alikes (0/O, 1/I). */
function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

// Status depends on the time; read it in the browser (0 while the page is built on the server).
function subscribeMinute(onChange: () => void) {
  const t = setInterval(onChange, 60_000);
  return () => clearInterval(t);
}
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;

const STATUS_VARIANT: Record<CouponStatus, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  scheduled: "outline",
  off: "secondary",
  expired: "secondary",
  used_up: "secondary",
};

export function CouponsEditor({
  coupons,
  products,
  categories,
}: {
  coupons: Coupon[];
  products: PickerProduct[];
  categories: PickerCategory[];
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const now = useSyncExternalStore(subscribeMinute, currentMinute, () => 0);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground max-w-2xl text-sm">
          Customers type a code at checkout. A code can take a percent or an amount off, or make delivery free, with a
          minimum order, dates, usage limits and the products or categories it covers.
        </p>
        {editing !== "new" && (
          <Button onClick={() => setEditing("new")}>
            <Plus /> Add coupon
          </Button>
        )}
      </div>
      {editing === "new" && (
        <CouponForm
          initial={EMPTY}
          coupon={null}
          products={products}
          categories={categories}
          onDone={() => setEditing(null)}
        />
      )}
      {coupons.length === 0 && editing !== "new" && (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">No coupons yet.</p>
      )}
      {coupons.map((c) =>
        editing === c.id ? (
          <CouponForm
            key={c.id}
            initial={toForm(c)}
            coupon={c}
            products={products}
            categories={categories}
            onDone={() => setEditing(null)}
          />
        ) : (
          <CouponCard
            key={c.id}
            coupon={c}
            status={now ? couponStatus(c, now) : null}
            products={products}
            categories={categories}
            onEdit={() => setEditing(c.id)}
          />
        ),
      )}
    </div>
  );
}

function scopeText(c: Coupon, products: PickerProduct[], categories: PickerCategory[]): string {
  if (c.productIds.length === 0 && c.categoryIds.length === 0) return "Whole store";
  const names = [
    ...c.categoryIds.map((id) => categories.find((x) => x.id === id)?.name ?? "Deleted category"),
    ...c.productIds.map((id) => products.find((x) => x.id === id)?.title ?? "Deleted product"),
  ];
  return names.length <= 3 ? `Only ${names.join(", ")}` : `Only ${names.slice(0, 3).join(", ")} +${names.length - 3}`;
}

const dhakaDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function CouponCard({
  coupon: c,
  status,
  products,
  categories,
  onEdit,
}: {
  coupon: Coupon;
  status: CouponStatus | null;
  products: PickerProduct[];
  categories: PickerCategory[];
  onEdit: () => void;
}) {
  const [pending, start] = useTransition();
  const facts = [
    describeCoupon(c),
    c.minOrder > 0 ? `Orders from ${formatTaka(c.minOrder)}` : null,
    scopeText(c, products, categories),
    `Used ${c.usedCount}${c.usageLimit > 0 ? ` of ${c.usageLimit}` : ""}`,
    c.perCustomerLimit > 0 ? `${c.perCustomerLimit} per customer` : "No per-customer limit",
    c.startsAt ? `From ${dhakaDate(c.startsAt)}` : null,
    c.endsAt ? `Until ${dhakaDate(c.endsAt)}` : null,
  ].filter(Boolean);

  return (
    <Card className={status === "active" || status === null ? undefined : "opacity-75"}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle className="flex items-center gap-2 font-mono tracking-wide">
            {c.code}
            {status && <Badge variant={STATUS_VARIANT[status]}>{COUPON_STATUS_NAMES[status]}</Badge>}
          </CardTitle>
          {c.note && <CardDescription>{c.note}</CardDescription>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Switch
            checked={c.active}
            disabled={pending}
            aria-label={`${c.code} on`}
            onCheckedChange={(on) =>
              start(async () => {
                report(await setCouponActiveAction(c.id, on));
              })
            }
          />
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending || c.usedCount > 0}
            title={c.usedCount > 0 ? "Used on orders: switch it off instead" : undefined}
            onClick={() => {
              if (!confirm(`Delete the coupon ${c.code}?`)) return;
              start(async () => {
                report(await deleteCouponAction(c.id));
              });
            }}
          >
            <Trash2 /> Delete
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-wrap gap-2 text-sm">
          {facts.map((f) => (
            <li key={f} className="bg-muted rounded-md px-2 py-1">
              {f}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function CouponForm({
  initial,
  coupon,
  products,
  categories,
  onDone,
}: {
  initial: Form;
  coupon: Coupon | null;
  products: PickerProduct[];
  categories: PickerCategory[];
  onDone: () => void;
}) {
  const [f, setF] = useState(initial);
  const [scoped, setScoped] = useState(initial.productIds.length + initial.categoryIds.length > 0);
  const [search, setSearch] = useState("");
  const [pending, start] = useTransition();
  const set = (patch: Partial<Form>) => setF((prev) => ({ ...prev, ...patch }));
  const p = coupon?.id ?? "new";
  const codeLocked = (coupon?.usedCount ?? 0) > 0;

  const productById = useMemo(() => new Map(products.map((x) => [x.id, x])), [products]);
  const q = search.trim().toLowerCase();
  const results = q
    ? products.filter((x) => !f.productIds.includes(x.id) && x.title.toLowerCase().includes(q)).slice(0, 8)
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{coupon ? `Edit ${coupon.code}` : "New coupon"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            const data = scoped ? f : { ...f, productIds: [], categoryIds: [] };
            start(async () => {
              if (report(await saveCouponAction(coupon?.id ?? null, fromForm(data)))) onDone();
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Code"
              htmlFor={`${p}-code`}
              hint={codeLocked ? "Used on orders, so the code can't change." : "What customers type. 3–30 characters."}
            >
              <div className="flex gap-2">
                <Input
                  id={`${p}-code`}
                  required
                  maxLength={30}
                  disabled={codeLocked}
                  className="font-mono uppercase"
                  value={f.code}
                  onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, "") })}
                />
                {!codeLocked && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => set({ code: randomCode() })}
                    aria-label="Make a random code"
                    title="Make a random code"
                  >
                    <Shuffle />
                  </Button>
                )}
              </div>
            </Field>
            <Field label="Type" htmlFor={`${p}-type`}>
              <select
                id={`${p}-type`}
                className={selectClass}
                value={f.type}
                onChange={(e) => set({ type: e.target.value as CouponType })}
              >
                {COUPON_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {COUPON_TYPE_NAMES[t]}
                  </option>
                ))}
              </select>
            </Field>
            {f.type === "percent" && (
              <Field label="Percent off" htmlFor={`${p}-value`} hint="1 to 100">
                <Input
                  id={`${p}-value`}
                  inputMode="numeric"
                  value={f.value}
                  onChange={(e) => set({ value: e.target.value.replace(/\D/g, "") })}
                />
              </Field>
            )}
            {f.type === "fixed" && (
              <Field label="Amount off" htmlFor={`${p}-value`}>
                <TakaInput id={`${p}-value`} value={f.value} onChange={(v) => set({ value: v })} />
              </Field>
            )}
            {f.type === "free_delivery" && (
              <p className="text-muted-foreground self-end text-sm">
                The delivery charge becomes ৳0. The COD fee, if any, stays.
              </p>
            )}
            {f.type === "percent" && (
              <Field label="Most it can take off" htmlFor={`${p}-max`} hint="Empty = no cap">
                <TakaInput id={`${p}-max`} value={f.maxDiscount} onChange={(v) => set({ maxDiscount: v })} />
              </Field>
            )}
            <Field label="Minimum order" htmlFor={`${p}-min`} hint="Cart value before the discount. Empty = none">
              <TakaInput id={`${p}-min`} value={f.minOrder} onChange={(v) => set({ minOrder: v })} />
            </Field>
            <Field label="Total uses" htmlFor={`${p}-limit`} hint="Orders in all. Empty = unlimited">
              <Input
                id={`${p}-limit`}
                inputMode="numeric"
                value={f.usageLimit}
                onChange={(e) => set({ usageLimit: e.target.value.replace(/\D/g, "") })}
              />
            </Field>
            <Field label="Uses per customer" htmlFor={`${p}-per`} hint="By phone number or account. 0 = unlimited">
              <Input
                id={`${p}-per`}
                inputMode="numeric"
                value={f.perCustomerLimit}
                onChange={(e) => set({ perCustomerLimit: e.target.value.replace(/\D/g, "") })}
              />
            </Field>
            <Field label="Starts (Bangladesh time)" htmlFor={`${p}-start`} hint="Empty = right away">
              <Input
                id={`${p}-start`}
                type="datetime-local"
                value={f.startsAt}
                onChange={(e) => set({ startsAt: e.target.value })}
              />
            </Field>
            <Field label="Ends (Bangladesh time)" htmlFor={`${p}-end`} hint="Empty = no end">
              <Input
                id={`${p}-end`}
                type="datetime-local"
                value={f.endsAt}
                onChange={(e) => set({ endsAt: e.target.value })}
              />
            </Field>
          </div>

          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-medium">Applies to</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${p}-scope`}
                  checked={!scoped}
                  onChange={() => setScoped(false)}
                  className="accent-brand size-4"
                />
                The whole store
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${p}-scope`}
                  checked={scoped}
                  onChange={() => setScoped(true)}
                  className="accent-brand size-4"
                />
                Only some categories or products
              </label>
            </div>
            {scoped && (
              <div className="grid gap-4 rounded-md border p-4 lg:grid-cols-2">
                <div className="grid content-start gap-2">
                  <p className="text-sm font-medium">Categories</p>
                  <p className="text-muted-foreground text-xs">Sub-categories are included.</p>
                  {categories.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No categories yet.</p>
                  ) : (
                    <ul className="grid max-h-56 gap-1 overflow-y-auto">
                      {categories.map((c) => (
                        <li key={c.id}>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="accent-brand size-4"
                              checked={f.categoryIds.includes(c.id)}
                              onChange={(e) =>
                                set({
                                  categoryIds: e.target.checked
                                    ? [...f.categoryIds, c.id]
                                    : f.categoryIds.filter((x) => x !== c.id),
                                })
                              }
                            />
                            {c.name}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="grid content-start gap-2">
                  <p className="text-sm font-medium">Products</p>
                  <div className="relative">
                    <Input
                      aria-label="Search products to add"
                      placeholder="Search products to add"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {results.length > 0 && (
                      <ul className="bg-popover absolute z-10 mt-1 w-full rounded-md border shadow-md">
                        {results.map((x) => (
                          <li key={x.id}>
                            <button
                              type="button"
                              className="hover:bg-muted w-full px-3 py-2 text-left text-sm"
                              onClick={() => {
                                set({ productIds: [...f.productIds, x.id] });
                                setSearch("");
                              }}
                            >
                              {x.title}
                              {x.status !== "active" && <span className="text-muted-foreground"> · {x.status}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {f.productIds.length > 0 && (
                    <ul className="grid gap-1">
                      {f.productIds.map((id) => (
                        <li key={id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1">
                          <span className="truncate text-sm">{productById.get(id)?.title ?? "Deleted product"}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${productById.get(id)?.title ?? "product"}`}
                            onClick={() => set({ productIds: f.productIds.filter((x) => x !== id) })}
                          >
                            <X />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Note for staff (optional)" htmlFor={`${p}-note`} hint="Not shown to customers.">
              <Input id={`${p}-note`} maxLength={200} value={f.note} onChange={(e) => set({ note: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <Switch checked={f.active} onCheckedChange={(active) => set({ active })} aria-label="Coupon on" />
              On
            </label>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : coupon ? "Save coupon" : "Create coupon"}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
