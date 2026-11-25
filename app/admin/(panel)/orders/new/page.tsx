import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ManualOrderForm } from "@/components/admin/orders/manual-order-form";
import { requireStaff } from "@/modules/auth/session";
import { getDeliveryConfig } from "@/modules/delivery/data";

export const metadata: Metadata = { title: "New order" };

// The signed-in staff member, on every request.
export const instant = false;

/** A manual order taken in a Facebook or WhatsApp chat or on a call (Open question 9). */
export default async function NewOrderPage() {
  await requireStaff("orders.create");
  const config = await getDeliveryConfig();
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link
          href="/admin/orders"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden /> Orders
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">New order</h1>
        <p className="text-muted-foreground text-sm">
          For orders taken in a Facebook or WhatsApp chat or on a call. No SMS code is needed: you have spoken to the
          customer.
        </p>
      </div>
      <ManualOrderForm
        districts={config.districts
          .map((d) => ({ id: d.id, name: d.name.en }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        areas={config.areas
          .filter((a) => a.active)
          .map((a) => ({ id: a.id, name: a.name.en, districtId: a.districtId, zoneId: a.zoneId }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        districtZones={Object.fromEntries(config.districts.map((d) => [d.id, d.zoneId]))}
        zones={config.zones}
        rules={config.rules}
      />
    </div>
  );
}
