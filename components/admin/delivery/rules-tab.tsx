"use client";

import { X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Field, poishaToInput, report, TakaInput } from "@/components/admin/catalog/form-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { saveRulesAction } from "@/modules/delivery/actions";
import type { DeliveryRules } from "@/modules/delivery/charge";
import { dhakaInputToIso, isoToDhakaInput } from "@/modules/storefront/sections";
import type { PickerProduct } from "./delivery-editor";

export function RulesTab({ rules, products }: { rules: DeliveryRules; products: PickerProduct[] }) {
  const [packaging, setPackaging] = useState(String(rules.packagingGrams));
  const [freeAbove, setFreeAbove] = useState(poishaToInput(rules.freeAbove));
  const [freeIds, setFreeIds] = useState(rules.freeProductIds);
  const [flat, setFlat] = useState({
    enabled: rules.flat.enabled,
    charge: poishaToInput(rules.flat.charge),
    startAt: isoToDhakaInput(rules.flat.startAt),
    endAt: isoToDhakaInput(rules.flat.endAt),
  });
  const [search, setSearch] = useState("");
  const [pending, start] = useTransition();

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const q = search.trim().toLowerCase();
  const results = q
    ? products.filter((p) => !freeIds.includes(p.id) && p.title.toLowerCase().includes(q)).slice(0, 8)
    : [];

  function save() {
    start(async () => {
      report(
        await saveRulesAction({
          packagingGrams: packaging || "0",
          freeAbove: freeAbove || "0",
          freeProductIds: freeIds,
          flat: {
            enabled: flat.enabled,
            charge: flat.charge || "0",
            startAt: flat.startAt ? dhakaInputToIso(flat.startAt) : null,
            endAt: flat.endAt ? dhakaInputToIso(flat.endAt) : null,
          },
        }),
      );
    });
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Weight and free delivery</CardTitle>
          <CardDescription>
            Delivery is free when the cart reaches the amount below (a zone&apos;s own amount wins), or when every
            product in the cart is a free-delivery product.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Packaging weight (grams)" htmlFor="rules-pack" hint="Box and wrapping, added to every order">
            <Input
              id="rules-pack"
              inputMode="numeric"
              value={packaging}
              onChange={(e) => setPackaging(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field label="Free delivery everywhere above" htmlFor="rules-free" hint="Empty = no store-wide threshold">
            <TakaInput id="rules-free" value={freeAbove} onChange={setFreeAbove} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Free-delivery products</CardTitle>
          <CardDescription>
            Orders made up only of these products ship free. A cart that mixes them with other products pays the normal
            charge.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="relative max-w-md">
            <Input
              aria-label="Search products to add"
              placeholder="Search products to add"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {results.length > 0 && (
              <ul className="bg-popover absolute z-10 mt-1 w-full rounded-md border shadow-md">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="hover:bg-muted w-full px-3 py-2 text-left text-sm"
                      onClick={() => {
                        setFreeIds([...freeIds, p.id]);
                        setSearch("");
                      }}
                    >
                      {p.title}
                      {p.status !== "active" && <span className="text-muted-foreground"> · {p.status}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {freeIds.length === 0 ? (
            <p className="text-muted-foreground text-sm">No free-delivery products.</p>
          ) : (
            <ul className="grid gap-1">
              {freeIds.map((id) => (
                <li key={id} className="flex max-w-md items-center justify-between gap-2 rounded-md border px-3 py-1.5">
                  <span className="truncate text-sm">{byId.get(id)?.title ?? "Deleted product"}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${byId.get(id)?.title ?? "product"}`}
                    onClick={() => setFreeIds(freeIds.filter((x) => x !== id))}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Flat-rate campaign</CardTitle>
          <CardDescription>
            One delivery charge everywhere for a while, for example ৳49 during a sale. Free-delivery rules still apply.
            Times are Bangladesh time; leave them empty to start now or run until you switch it off.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={flat.enabled} onCheckedChange={(v) => setFlat({ ...flat, enabled: v })} />
            Campaign on
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Charge" htmlFor="flat-charge">
              <TakaInput id="flat-charge" value={flat.charge} onChange={(v) => setFlat({ ...flat, charge: v })} />
            </Field>
            <Field label="Starts" htmlFor="flat-start">
              <Input
                id="flat-start"
                type="datetime-local"
                value={flat.startAt}
                onChange={(e) => setFlat({ ...flat, startAt: e.target.value })}
              />
            </Field>
            <Field label="Ends" htmlFor="flat-end">
              <Input
                id="flat-end"
                type="datetime-local"
                value={flat.endAt}
                onChange={(e) => setFlat({ ...flat, endAt: e.target.value })}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save rules"}
        </Button>
      </div>
    </form>
  );
}
