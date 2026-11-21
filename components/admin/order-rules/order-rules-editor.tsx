"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { Field, poishaToInput, report, selectClass, TakaInput } from "@/components/admin/catalog/form-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AdvanceRule } from "@/modules/delivery/charge";
import type { OrderRules, RuleAdvance } from "@/modules/orders/risk";
import { saveOrderRulesAction } from "@/modules/orders/rules-actions";

type ZoneOption = { id: string; name: string; active: boolean; advanceRule: AdvanceRule };

/** Numbers are kept as typed (strings) and checked on the server. */
type Form = Omit<OrderRules, "reservationHours" | "highValueAbove" | "pastProblemsAtLeast" | "highScoreAtLeast"> & {
  reservationHours: string;
  highValueAbove: string;
  pastProblemsAtLeast: string;
  highScoreAtLeast: string;
};

const ADVANCE_NAMES: Record<RuleAdvance, string> = {
  delivery: "The delivery charge",
  full: "The full order amount",
};
const ZONE_ADVANCE: Record<AdvanceRule, string> = {
  none: "no advance",
  delivery: "delivery charge in advance",
  full: "full amount in advance",
};

export function OrderRulesEditor({
  rules,
  saved,
  zones,
  walletsOn,
}: {
  rules: OrderRules;
  saved: boolean;
  zones: ZoneOption[];
  walletsOn: number;
}) {
  const [form, setForm] = useState<Form>(() => ({
    ...rules,
    reservationHours: String(rules.reservationHours),
    highValueAbove: poishaToInput(rules.highValueAbove) || "0",
    pastProblemsAtLeast: String(rules.pastProblemsAtLeast),
    highScoreAtLeast: String(rules.highScoreAtLeast),
  }));
  const [pending, start] = useTransition();
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const toggleZone = (id: string, on: boolean) =>
    set({ farZoneIds: on ? [...form.farZoneIds, id] : form.farZoneIds.filter((z) => z !== id) });

  function save() {
    start(async () => {
      report(await saveOrderRulesAction(form));
    });
  }

  return (
    <div className="grid gap-6">
      {walletsOn === 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          No bKash or Nagad number is switched on, so these rules can&apos;t ask for an advance yet. Orders they catch
          still go through as cash on delivery, marked <strong>call before confirming</strong>.{" "}
          <Link href="/admin/payments" className="underline underline-offset-2">
            Set up payments
          </Link>
        </p>
      )}
      {!saved && (
        <p className="text-muted-foreground text-sm">
          These are the starting rules. They apply now; saving keeps any changes you make.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Advance payment</CardTitle>
          <CardDescription>
            When a rule below matches, checkout asks for this instead of cash on delivery. A zone that already asks for
            more keeps its own rule.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Customers pay first" htmlFor="rules-advance">
            <select
              id="rules-advance"
              className={selectClass}
              value={form.advance}
              onChange={(e) => set({ advance: e.target.value as RuleAdvance })}
            >
              {(Object.keys(ADVANCE_NAMES) as RuleAdvance[]).map((a) => (
                <option key={a} value={a}>
                  {ADVANCE_NAMES[a]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Hold stock for new orders (hours)"
            htmlFor="rules-hold"
            hint="A pending order keeps its items aside this long. Confirming it keeps them for good."
          >
            <Input
              id="rules-hold"
              inputMode="numeric"
              value={form.reservationHours}
              onChange={(e) => set({ reservationHours: e.target.value.replace(/\D/g, "") })}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>When to ask for an advance</CardTitle>
          <CardDescription>
            The first rule that matches applies. Returning customers with delivered orders skip the far-zone rule.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Rule
            id="rule-far"
            title="New customers in far zones"
            hint="Customers with no delivered order yet, ordering to a zone ticked below. Far zones also add to the risk score."
            on={form.newCustomerFar}
            keepOpen
            onChange={(newCustomerFar) => set({ newCustomerFar })}
          >
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Far zones</legend>
              {zones.length === 0 && <p className="text-muted-foreground text-sm">No delivery zones yet.</p>}
              {zones.map((z) => (
                <div key={z.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`far-${z.id}`}
                    checked={form.farZoneIds.includes(z.id)}
                    onCheckedChange={(v) => toggleZone(z.id, v === true)}
                  />
                  <Label htmlFor={`far-${z.id}`} className="font-normal">
                    {z.name}
                    <span className="text-muted-foreground text-xs">
                      {" "}
                      ({ZONE_ADVANCE[z.advanceRule]}
                      {z.active ? "" : ", off"})
                    </span>
                  </Label>
                </div>
              ))}
            </fieldset>
          </Rule>

          <Rule
            id="rule-value"
            title="Large orders"
            hint="Items total above this amount, before delivery."
            on={form.highValueOn}
            onChange={(highValueOn) => set({ highValueOn })}
          >
            <Field label="Above" htmlFor="rule-value-amount" className="max-w-48">
              <TakaInput
                id="rule-value-amount"
                value={form.highValueAbove}
                onChange={(highValueAbove) => set({ highValueAbove })}
              />
            </Field>
          </Rule>

          <Rule
            id="rule-past"
            title="Past cancelled or returned orders"
            hint="Counts earlier orders on the same phone number."
            on={form.pastProblemsOn}
            onChange={(pastProblemsOn) => set({ pastProblemsOn })}
          >
            <Field label="At least this many" htmlFor="rule-past-count" className="max-w-48">
              <Input
                id="rule-past-count"
                inputMode="numeric"
                value={form.pastProblemsAtLeast}
                onChange={(e) => set({ pastProblemsAtLeast: e.target.value.replace(/\D/g, "") })}
              />
            </Field>
          </Rule>

          <Rule
            id="rule-score"
            title="High risk score"
            hint="The score adds up flags, returns, cancellations, a new customer, a far zone, a large order and other numbers ordering from the same device."
            on={form.highScoreOn}
            onChange={(highScoreOn) => set({ highScoreOn })}
          >
            <Field label="Score at least (10–100)" htmlFor="rule-score-at" className="max-w-48">
              <Input
                id="rule-score-at"
                inputMode="numeric"
                value={form.highScoreAtLeast}
                onChange={(e) => set({ highScoreAtLeast: e.target.value.replace(/\D/g, "") })}
              />
            </Field>
          </Rule>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save order rules"}
        </Button>
        <p className="text-muted-foreground text-sm">
          Checkout uses them right away. To stop a number ordering, use{" "}
          <Link href="/admin/blocked-numbers" className="underline underline-offset-2">
            Blocked numbers
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function Rule({
  id,
  title,
  hint,
  on,
  onChange,
  keepOpen,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  on: boolean;
  onChange: (on: boolean) => void;
  /** Show the settings even when the rule is off (they matter elsewhere). */
  keepOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3 border-b pb-5 last:border-b-0 last:pb-0" aria-labelledby={`${id}-title`}>
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <h3 id={`${id}-title`} className="text-sm font-semibold">
            {title}
          </h3>
          <p className="text-muted-foreground text-xs">{hint}</p>
        </div>
        <Switch checked={on} onCheckedChange={onChange} aria-labelledby={`${id}-title`} />
      </div>
      {(on || keepOpen) && children}
    </section>
  );
}
