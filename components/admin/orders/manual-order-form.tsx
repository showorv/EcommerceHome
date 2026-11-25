"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field, poishaToInput, selectClass, TakaInput } from "@/components/admin/catalog/form-bits";
import { ProductSearch } from "@/components/admin/orders/order-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatTaka } from "@/lib/money";
import { deliveryQuote, type DeliveryRules, type Zone } from "@/modules/delivery/charge";
import type { VariantOption } from "@/modules/orders/admin-data";
import { createManualOrderAction } from "@/modules/orders/admin-actions";
import {
  MANUAL_MAX_QTY,
  MANUAL_SOURCES,
  manualPaymentMethod,
  manualTotals,
  ORDER_SOURCE_NAMES,
  type ManualSource,
} from "@/modules/orders/manual";
import { PAYMENT_METHOD_NAMES } from "@/modules/checkout/checkout";
import { WALLET_NAMES, WALLET_TYPES, type WalletType } from "@/modules/payments/payments";

type Line = VariantOption & { qty: number };

const toTaka = (s: string) => Math.round((Number(s) || 0) * 100);

/**
 * The manual order form (Open question 9). Prices come from the products today; staff can give a
 * discount and change the delivery charge. The server checks and works out everything again.
 */
export function ManualOrderForm({
  districts,
  areas,
  districtZones,
  zones,
  rules,
}: {
  districts: { id: string; name: string }[];
  areas: { id: string; name: string; districtId: string; zoneId: string | null }[];
  districtZones: Record<string, string | null>;
  zones: Zone[];
  rules: DeliveryRules;
}) {
  const router = useRouter();
  const [key] = useState(() => crypto.randomUUID());
  const [now] = useState(() => Date.now());
  const [source, setSource] = useState<ManualSource | "">("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("");
  const [delivery, setDelivery] = useState("");
  const [payWallet, setPayWallet] = useState<WalletType | "">("");
  const [senderNumber, setSenderNumber] = useState("");
  const [trxId, setTrxId] = useState("");
  const [advance, setAdvance] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [pending, start] = useTransition();

  const areaList = areas.filter((a) => a.districtId === districtId);
  const area = areas.find((a) => a.id === areaId && a.districtId === districtId);
  const zoneId = area ? (area.zoneId ?? districtZones[districtId] ?? null) : null;
  const zone = zones.find((z) => z.id === zoneId && z.active) ?? null;

  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
  const suggested = zone
    ? deliveryQuote({ zone, rules, lines, subtotal: subtotal - Math.min(subtotal, toTaka(discount)), now }).charge
    : null;
  const totals = manualTotals({
    items: lines,
    discount: toTaka(discount),
    deliveryCharge: delivery.trim() === "" ? (suggested ?? 0) : toTaka(delivery),
    codFeePercent: zone?.codFeePercent ?? 0,
    advancePaid: payWallet ? toTaka(advance) : 0,
  });

  const setQty = (variantId: string, qty: number) =>
    setLines((ls) =>
      ls.map((l) => (l.variantId === variantId ? { ...l, qty: Math.min(MANUAL_MAX_QTY, Math.max(1, qty)) } : l)),
    );
  const add = (v: VariantOption) =>
    setLines((ls) =>
      ls.some((l) => l.variantId === v.variantId)
        ? ls.map((l) => (l.variantId === v.variantId ? { ...l, qty: Math.min(MANUAL_MAX_QTY, l.qty + 1) } : l))
        : [...ls, { ...v, qty: 1 }],
    );

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await createManualOrderAction({
        key,
        source,
        name,
        phone,
        email,
        districtId,
        areaId,
        address,
        note,
        items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
        discount,
        deliveryCharge: delivery.trim() === "" ? "" : delivery,
        payWallet,
        senderNumber,
        trxId,
        advanceAmount: payWallet ? advance : "",
        staffNote,
      });
      if (res.ok) {
        toast.success(res.message);
        router.push(`/admin/orders/${res.orderNo}`);
        return;
      }
      setErrors(res.fields ?? {});
      toast.error(res.fields ? (Object.values(res.fields)[0] ?? res.error) : res.error);
    });
  }

  const err = (k: string) => errors[k];

  return (
    <form onSubmit={save} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]" noValidate>
      <div className="grid min-w-0 content-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Where it came from</CardTitle>
          </CardHeader>
          <CardContent>
            <fieldset className="flex flex-wrap gap-2" aria-describedby={err("source") ? "mo-source-err" : undefined}>
              <legend className="sr-only">Where the order came from</legend>
              {MANUAL_SOURCES.map((s) => (
                <label
                  key={s}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${source === s ? "border-primary bg-primary/5 font-medium" : ""}`}
                >
                  <input type="radio" name="mo-source" value={s} checked={source === s} onChange={() => setSource(s)} />
                  {ORDER_SOURCE_NAMES[s]}
                </label>
              ))}
            </fieldset>
            {err("source") && (
              <p id="mo-source-err" className="text-destructive mt-2 text-sm">
                {err("source")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Products</CardTitle>
            <CardDescription>At today&apos;s prices. The stock is held as soon as the order is saved.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {lines.length === 0 ? (
              <p className="text-muted-foreground text-sm">No products yet. Search below to add them.</p>
            ) : (
              <ul className="grid gap-3">
                {lines.map((l) => (
                  <li key={l.variantId} className="flex flex-wrap items-center gap-3 border-b pb-3 last:border-b-0">
                    {l.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail
                      <img src={l.image} alt="" className="bg-muted size-10 rounded-md object-cover" />
                    ) : (
                      <div className="bg-muted size-10 rounded-md" />
                    )}
                    <div className="min-w-0 flex-1 basis-40">
                      <div className="truncate font-medium">{l.title}</div>
                      <div className="text-muted-foreground text-xs">
                        {[l.variantTitle, l.sku, formatTaka(l.price)].filter(Boolean).join(" · ")} · {l.available} free
                      </div>
                      {l.qty > l.available && (
                        <div className="text-destructive text-xs">Only {l.available} free right now.</div>
                      )}
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
                      onClick={() => setLines((ls) => ls.filter((x) => x.variantId !== l.variantId))}
                      aria-label={`Remove ${l.title} ${l.variantTitle}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {err("items") && <p className="text-destructive text-sm">{err("items")}</p>}
            <ProductSearch onAdd={add} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer and address</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="mo-name" error={err("name")}>
              <Input id="mo-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Mobile number" htmlFor="mo-phone" error={err("phone")}>
              <Input
                id="mo-phone"
                type="tel"
                inputMode="tel"
                maxLength={18}
                placeholder="01712345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Field label="Email (optional)" htmlFor="mo-email" className="sm:col-span-2" error={err("email")}>
              <Input
                id="mo-email"
                type="email"
                maxLength={120}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="District" htmlFor="mo-district" error={err("districtId")}>
              <select
                id="mo-district"
                className={selectClass}
                value={districtId}
                onChange={(e) => {
                  setDistrictId(e.target.value);
                  setAreaId("");
                }}
              >
                <option value="">Choose a district</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Area / thana"
              htmlFor="mo-area"
              error={err("areaId")}
              hint={zone ? `Zone: ${zone.name}` : areaId ? "This area has no delivery zone switched on." : undefined}
            >
              <select
                id="mo-area"
                className={selectClass}
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                disabled={!districtId}
              >
                <option value="">Choose an area</option>
                {areaList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Full address" htmlFor="mo-address" className="sm:col-span-2" error={err("address")}>
              <Textarea
                id="mo-address"
                rows={2}
                maxLength={250}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </Field>
            <Field label="Delivery note (optional)" htmlFor="mo-note" className="sm:col-span-2" error={err("note")}>
              <Input id="mo-note" maxLength={250} value={note} onChange={(e) => setNote(e.target.value)} />
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
            <Field label="Discount (optional)" htmlFor="mo-discount" error={err("discount")}>
              <TakaInput id="mo-discount" value={discount} onChange={setDiscount} placeholder="0" />
            </Field>
            <Field
              label="Delivery charge"
              htmlFor="mo-delivery"
              error={err("deliveryCharge")}
              hint={
                suggested === null ? (
                  "Choose the area to see the zone's charge."
                ) : delivery.trim() === "" ? (
                  `The zone's charge: ${formatTaka(suggested)}. Type an amount to change it.`
                ) : (
                  <>
                    The zone charges {formatTaka(suggested)}.{" "}
                    <button type="button" className="underline underline-offset-2" onClick={() => setDelivery("")}>
                      Use it
                    </button>
                  </>
                )
              }
            >
              <TakaInput
                id="mo-delivery"
                value={delivery}
                onChange={setDelivery}
                placeholder={suggested !== null ? poishaToInput(suggested) || "0" : ""}
              />
            </Field>

            <Field label="Advance already received" htmlFor="mo-wallet" error={err("payWallet")}>
              <select
                id="mo-wallet"
                className={selectClass}
                value={payWallet}
                onChange={(e) => setPayWallet(e.target.value as WalletType | "")}
              >
                <option value="">None: cash on delivery</option>
                {WALLET_TYPES.map((w) => (
                  <option key={w} value={w}>
                    {WALLET_NAMES[w]}
                  </option>
                ))}
              </select>
            </Field>
            {payWallet && (
              <div className="grid gap-3 rounded-md border p-3">
                <Field label="Amount received" htmlFor="mo-advance" error={err("advanceAmount")}>
                  <TakaInput id="mo-advance" value={advance} onChange={setAdvance} />
                </Field>
                <Field
                  label={`${WALLET_NAMES[payWallet]} number it came from`}
                  htmlFor="mo-sender"
                  error={err("senderNumber")}
                >
                  <Input
                    id="mo-sender"
                    type="tel"
                    inputMode="tel"
                    maxLength={18}
                    value={senderNumber}
                    onChange={(e) => setSenderNumber(e.target.value)}
                  />
                </Field>
                <Field
                  label="TrxID"
                  htmlFor="mo-trx"
                  error={err("trxId")}
                  hint={"Checked on the order page like any advance."}
                >
                  <Input
                    id="mo-trx"
                    maxLength={30}
                    autoCapitalize="characters"
                    spellCheck={false}
                    value={trxId}
                    onChange={(e) => setTrxId(e.target.value)}
                  />
                </Field>
              </div>
            )}

            <dl className="grid gap-1.5 border-t pt-3 text-sm">
              <Money label="Subtotal" value={totals.subtotal} />
              {totals.discount > 0 && <Money label="Discount" value={-totals.discount} />}
              <Money label="Delivery" value={totals.deliveryCharge} />
              {totals.codFee > 0 && <Money label="COD fee" value={totals.codFee} />}
              <div className="flex justify-between font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatTaka(totals.total)}</dd>
              </div>
              {totals.advancePaid > 0 && <Money label="Advance received" value={-totals.advancePaid} />}
              <Money label="To collect at the door" value={totals.codAmount} />
              <p className="text-muted-foreground text-xs">
                {PAYMENT_METHOD_NAMES[manualPaymentMethod(totals.advancePaid, totals.total)]}
              </p>
            </dl>
            {totals.overpaid > 0 && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm" role="status">
                The advance is {formatTaka(totals.overpaid)} more than the total.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3 pt-6">
            <Field
              label="Note for staff (optional)"
              htmlFor="mo-staff-note"
              error={err("staffNote")}
              hint={"Saved on the order."}
            >
              <Textarea
                id="mo-staff-note"
                rows={2}
                maxLength={500}
                placeholder="e.g. Asked on Messenger, wants delivery after 5 pm"
                value={staffNote}
                onChange={(e) => setStaffNote(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={pending || lines.length === 0}>
              {pending ? "Saving…" : "Save order"}
            </Button>
            <p className="text-muted-foreground text-xs">
              It starts as Pending, like a website order: confirm it on its page to send the invoice. The customer gets
              the usual &ldquo;order received&rdquo; message.
            </p>
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
