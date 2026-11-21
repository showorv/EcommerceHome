"use client";

import { useMemo, useState } from "react";
import { Field, selectClass, TakaInput } from "@/components/admin/catalog/form-bits";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formatTaka } from "@/lib/money";
import { ADVANCE_RULE_NAMES, codFee, deliveryQuote, zoneIdFor } from "@/modules/delivery/charge";
import type { DeliveryData } from "@/modules/delivery/data";
import { dhakaInputToIso, isoToDhakaInput } from "@/modules/storefront/sections";
import type { PickerProduct } from "./delivery-editor";
import { daysText } from "./zones-tab";

const REASONS = {
  weight: "Normal charge by weight",
  flat: "Flat-rate campaign",
  "free-threshold": "Free: the cart is above the free-delivery amount",
  "free-products": "Free: only free-delivery products",
} as const;

/** Uses the same calculation as the checkout, with the saved settings. */
export function TryTab({ data, products }: { data: DeliveryData; products: PickerProduct[] }) {
  const [districtId, setDistrictId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [kg, setKg] = useState("0.5");
  const [cart, setCart] = useState("1500");
  const [onlyFree, setOnlyFree] = useState(false);
  const [when, setWhen] = useState(() => isoToDhakaInput(new Date().toISOString()));

  const districts = useMemo(
    () => [...data.districts].sort((a, b) => a.name.en.localeCompare(b.name.en)),
    [data.districts],
  );
  const areas = data.areas.filter((a) => a.districtId === districtId);
  const freeProduct = data.rules.freeProductIds.find((id) => products.some((p) => p.id === id));

  const zoneId = areaId ? zoneIdFor(data, areaId) : null;
  const zone = data.zones.find((z) => z.id === zoneId);
  const area = data.areas.find((a) => a.id === areaId);
  const subtotal = Math.round(Number(cart || "0") * 100);
  const grams = Math.round(Number(kg || "0") * 1000);
  const whenIso = dhakaInputToIso(when);

  let result: React.ReactNode = <p className="text-muted-foreground text-sm">Pick a district and an area.</p>;
  if (area && !area.active) {
    result = <p className="text-sm">This area is switched off: shoppers can&apos;t choose it.</p>;
  } else if (areaId && (!zone || !zone.active)) {
    result = (
      <p className="text-sm">This area&apos;s zone is switched off or missing: shoppers can&apos;t order here.</p>
    );
  } else if (zone) {
    const q = deliveryQuote({
      zone,
      rules: data.rules,
      lines: [{ productId: onlyFree && freeProduct ? freeProduct : "try-it", weightGrams: grams, qty: 1 }],
      subtotal,
      now: whenIso ? Date.parse(whenIso) : 0,
    });
    const atDoor = zone.advanceRule === "full" ? 0 : subtotal + (zone.advanceRule === "delivery" ? 0 : q.charge);
    const fee = codFee(atDoor, zone.codFeePercent);
    const rows: [string, string][] = [
      ["Zone", zone.name],
      ["Weight with packaging", `${(q.weightGrams / 1000).toFixed(2)} kg`],
      ["Delivery charge", q.charge === 0 ? "Free" : formatTaka(q.charge)],
      ["Why", REASONS[q.reason]],
      ...(q.charge !== q.regularCharge ? [["Normal charge", formatTaka(q.regularCharge)] as [string, string]] : []),
      ...(q.freeAbove !== null && q.reason !== "free-threshold"
        ? [["Free delivery from", formatTaka(q.freeAbove)] as [string, string]]
        : []),
      ["Advance payment", ADVANCE_RULE_NAMES[zone.advanceRule]],
      ["COD fee", fee > 0 ? `${formatTaka(fee)} (${zone.codFeePercent}% of ${formatTaka(atDoor)})` : "None"],
      ["Shopper pays in total", formatTaka(subtotal + q.charge + fee)],
      ["Arrives in", daysText(q.minDays, q.maxDays)],
    ];
    result = (
      <dl className="grid max-w-lg grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Try a delivery</CardTitle>
          <CardDescription>See what a shopper would pay with the saved settings. Save changes first.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="District" htmlFor="try-district">
            <select
              id="try-district"
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
                  {d.name.en}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Area" htmlFor="try-area">
            <select
              id="try-area"
              className={selectClass}
              value={areaId}
              disabled={!districtId}
              onChange={(e) => setAreaId(e.target.value)}
            >
              <option value="">Choose an area</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name.en}
                  {a.active ? "" : " (off)"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Products weigh (kg)" htmlFor="try-kg" hint="Packaging is added">
            <Input
              id="try-kg"
              inputMode="decimal"
              value={kg}
              onChange={(e) => setKg(e.target.value.replace(/[^0-9.]/g, ""))}
            />
          </Field>
          <Field label="Cart value" htmlFor="try-cart" hint="After discounts">
            <TakaInput id="try-cart" value={cart} onChange={setCart} />
          </Field>
          <Field label="Order time" htmlFor="try-when" hint="Bangladesh time, to check a campaign">
            <Input id="try-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          {freeProduct && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox checked={onlyFree} onCheckedChange={(v) => setOnlyFree(v === true)} />
              The cart has only free-delivery products
            </label>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Result</CardTitle>
        </CardHeader>
        <CardContent>{result}</CardContent>
      </Card>
    </div>
  );
}
