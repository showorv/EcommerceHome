"use client";

import { useState, useTransition } from "react";
import { Field, report } from "@/components/admin/catalog/form-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveInvoiceSettingsAction } from "@/modules/invoices/actions";
import type { InvoiceSettings } from "@/modules/invoices/invoices";

/** What every new invoice prints, and how long its link works (FR-OR-03…05). */
export function InvoiceSettingsEditor({ settings }: { settings: InvoiceSettings }) {
  const [v, setV] = useState({ ...settings, linkDays: String(settings.linkDays) });
  const [pending, start] = useTransition();
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Shop details</CardTitle>
            <CardDescription>Printed at the top of the invoice.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Shop name" htmlFor="inv-shop">
              <Input
                id="inv-shop"
                maxLength={80}
                value={v.shopName}
                onChange={(e) => set({ shopName: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" htmlFor="inv-phone">
                <Input
                  id="inv-phone"
                  type="tel"
                  maxLength={40}
                  placeholder="01XXXXXXXXX"
                  value={v.phone}
                  onChange={(e) => set({ phone: e.target.value })}
                />
              </Field>
              <Field label="Email" htmlFor="inv-email">
                <Input
                  id="inv-email"
                  type="email"
                  maxLength={120}
                  value={v.email}
                  onChange={(e) => set({ email: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Address" htmlFor="inv-address">
              <Input
                id="inv-address"
                maxLength={200}
                placeholder="House, road, area, Dhaka"
                value={v.address}
                onChange={(e) => set({ address: e.target.value })}
              />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Footer and link</CardTitle>
            <CardDescription>The line at the bottom, and how long the customer&apos;s link works.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Footer" htmlFor="inv-footer" hint="A thank-you, or your return terms. Up to 300 characters.">
              <Textarea
                id="inv-footer"
                rows={3}
                maxLength={300}
                value={v.footer}
                onChange={(e) => set({ footer: e.target.value })}
              />
            </Field>
            <Field
              label="Link works for (days)"
              htmlFor="inv-days"
              hint="Counted from confirmation, or from when you make a new link. 1–730 days."
            >
              <Input
                id="inv-days"
                type="number"
                inputMode="numeric"
                min={1}
                max={730}
                className="w-32"
                value={v.linkDays}
                onChange={(e) => set({ linkDays: e.target.value })}
              />
            </Field>
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} onClick={() => start(async () => void report(await saveInvoiceSettingsAction(v)))}>
          {pending ? "Saving…" : "Save invoice settings"}
        </Button>
        <p className="text-muted-foreground text-sm">Applies to new invoices. Issued invoices never change.</p>
      </div>
    </div>
  );
}
