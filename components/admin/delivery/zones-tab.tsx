"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Field, poishaToInput, report, selectClass, TakaInput } from "@/components/admin/catalog/form-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatTaka } from "@/lib/money";
import { deleteZoneAction, saveZoneAction } from "@/modules/delivery/actions";
import {
  ADVANCE_RULE_NAMES,
  ADVANCE_RULES,
  COURIER_NAMES,
  COURIERS,
  type AdvanceRule,
  type Courier,
  type Zone,
} from "@/modules/delivery/charge";
import type { DeliveryData } from "@/modules/delivery/data";

type Form = {
  name: string;
  baseCharge: string;
  baseWeightKg: string;
  extraPerKg: string;
  codFeePercent: string;
  freeAbove: string;
  advanceRule: AdvanceRule;
  courier: Courier;
  minDays: string;
  maxDays: string;
  active: boolean;
};

const EMPTY: Form = {
  name: "",
  baseCharge: "",
  baseWeightKg: "1",
  extraPerKg: "",
  codFeePercent: "0",
  freeAbove: "",
  advanceRule: "none",
  courier: "none",
  minDays: "1",
  maxDays: "3",
  active: true,
};

const toForm = (z: Zone): Form => ({
  name: z.name,
  baseCharge: poishaToInput(z.baseCharge) || "0",
  baseWeightKg: String(z.baseWeightGrams / 1000),
  extraPerKg: poishaToInput(z.extraPerKg) || "0",
  codFeePercent: String(z.codFeePercent),
  freeAbove: poishaToInput(z.freeAbove),
  advanceRule: z.advanceRule,
  courier: z.courier,
  minDays: String(z.minDays),
  maxDays: String(z.maxDays),
  active: z.active,
});

const fromForm = (f: Form) => ({
  name: f.name,
  baseCharge: f.baseCharge || "0",
  baseWeightGrams: Math.round(Number(f.baseWeightKg || "0") * 1000),
  extraPerKg: f.extraPerKg || "0",
  codFeePercent: f.codFeePercent || "0",
  freeAbove: f.freeAbove || "0",
  advanceRule: f.advanceRule,
  courier: f.courier,
  minDays: f.minDays || "0",
  maxDays: f.maxDays || "0",
  active: f.active,
});

export const daysText = (min: number, max: number) =>
  min === max ? `${min} day${min === 1 ? "" : "s"}` : `${min}–${max} days`;

export function ZonesTab({ data }: { data: DeliveryData }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const usage = (id: string) => ({
    districts: data.districts.filter((d) => d.zoneId === id).length,
    areas: data.areas.filter((a) => a.zoneId === id).length,
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground max-w-2xl text-sm">
          A zone is a price list. Every district belongs to one zone, and an area can have its own zone (for example the
          city part of Dhaka district). Charges are for the first kilogram, plus an amount for every extra kilogram
          started.
        </p>
        {editing !== "new" && (
          <Button onClick={() => setEditing("new")}>
            <Plus /> Add zone
          </Button>
        )}
      </div>
      {editing === "new" && <ZoneForm initial={EMPTY} id={null} onDone={() => setEditing(null)} />}
      {data.zones.map((z) =>
        editing === z.id ? (
          <ZoneForm key={z.id} initial={toForm(z)} id={z.id} onDone={() => setEditing(null)} />
        ) : (
          <ZoneCard key={z.id} zone={z} usage={usage(z.id)} onEdit={() => setEditing(z.id)} />
        ),
      )}
    </div>
  );
}

function ZoneCard({
  zone: z,
  usage,
  onEdit,
}: {
  zone: Zone;
  usage: { districts: number; areas: number };
  onEdit: () => void;
}) {
  const [pending, start] = useTransition();
  const inUse = usage.districts + usage.areas > 0;
  const facts = [
    `${formatTaka(z.baseCharge)} up to ${z.baseWeightGrams / 1000} kg`,
    `+${formatTaka(z.extraPerKg)} per extra kg`,
    daysText(z.minDays, z.maxDays),
    z.codFeePercent > 0 ? `COD fee ${z.codFeePercent}%` : "No COD fee",
    z.freeAbove > 0 ? `Free above ${formatTaka(z.freeAbove)}` : null,
    ADVANCE_RULE_NAMES[z.advanceRule],
    z.courier !== "none" ? `Courier: ${COURIER_NAMES[z.courier]}` : null,
  ].filter(Boolean);

  return (
    <Card className={z.active ? undefined : "opacity-70"}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle className="flex items-center gap-2">
            {z.name}
            {!z.active && <Badge variant="secondary">Off</Badge>}
          </CardTitle>
          <CardDescription>
            Used by {usage.districts} district{usage.districts === 1 ? "" : "s"}
            {usage.areas > 0 && ` and ${usage.areas} area${usage.areas === 1 ? "" : "s"}`}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending || inUse}
            title={inUse ? "Move its districts and areas to another zone first" : undefined}
            onClick={() => {
              if (!confirm(`Delete the zone “${z.name}”?`)) return;
              start(async () => {
                report(await deleteZoneAction(z.id));
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

function ZoneForm({ initial, id, onDone }: { initial: Form; id: string | null; onDone: () => void }) {
  const [f, setF] = useState(initial);
  const [pending, start] = useTransition();
  const set = (patch: Partial<Form>) => setF((prev) => ({ ...prev, ...patch }));
  const p = id ?? "new";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{id ? `Edit ${initial.name}` : "New zone"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              if (report(await saveZoneAction(id, fromForm(f)))) onDone();
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Zone name" htmlFor={`${p}-name`}>
              <Input
                id={`${p}-name`}
                required
                maxLength={60}
                value={f.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field label="Charge" htmlFor={`${p}-base`} hint="For the first kilogram (or the weight next to it)">
              <TakaInput id={`${p}-base`} value={f.baseCharge} onChange={(v) => set({ baseCharge: v })} />
            </Field>
            <Field label="Covers up to (kg)" htmlFor={`${p}-bw`}>
              <Input
                id={`${p}-bw`}
                inputMode="decimal"
                value={f.baseWeightKg}
                onChange={(e) => set({ baseWeightKg: e.target.value.replace(/[^0-9.]/g, "") })}
              />
            </Field>
            <Field label="Each extra kg" htmlFor={`${p}-extra`} hint="Added for every kilogram started above that">
              <TakaInput id={`${p}-extra`} value={f.extraPerKg} onChange={(v) => set({ extraPerKg: v })} />
            </Field>
            <Field label="COD fee (%)" htmlFor={`${p}-cod`} hint="Of the amount collected at the door. 0 = none">
              <Input
                id={`${p}-cod`}
                inputMode="decimal"
                value={f.codFeePercent}
                onChange={(e) => set({ codFeePercent: e.target.value.replace(/[^0-9.]/g, "") })}
              />
            </Field>
            <Field
              label="Free delivery above"
              htmlFor={`${p}-free`}
              hint="Cart value after discounts. Empty = use the store-wide rule"
            >
              <TakaInput id={`${p}-free`} value={f.freeAbove} onChange={(v) => set({ freeAbove: v })} />
            </Field>
            <Field label="Advance payment" htmlFor={`${p}-adv`}>
              <select
                id={`${p}-adv`}
                className={selectClass}
                value={f.advanceRule}
                onChange={(e) => set({ advanceRule: e.target.value as AdvanceRule })}
              >
                {ADVANCE_RULES.map((r) => (
                  <option key={r} value={r}>
                    {ADVANCE_RULE_NAMES[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Courier" htmlFor={`${p}-courier`} hint="The courier this zone's parcels usually go with">
              <select
                id={`${p}-courier`}
                className={selectClass}
                value={f.courier}
                onChange={(e) => set({ courier: e.target.value as Courier })}
              >
                {COURIERS.map((c) => (
                  <option key={c} value={c}>
                    {COURIER_NAMES[c]}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Delivery from (days)" htmlFor={`${p}-min`}>
                <Input
                  id={`${p}-min`}
                  inputMode="numeric"
                  value={f.minDays}
                  onChange={(e) => set({ minDays: e.target.value.replace(/\D/g, "") })}
                />
              </Field>
              <Field label="to (days)" htmlFor={`${p}-max`}>
                <Input
                  id={`${p}-max`}
                  inputMode="numeric"
                  value={f.maxDays}
                  onChange={(e) => set({ maxDays: e.target.value.replace(/\D/g, "") })}
                />
              </Field>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={f.active} onCheckedChange={(v) => set({ active: v })} />
            Zone is on (shoppers in its districts and areas can order)
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : id ? "Save zone" : "Add zone"}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
