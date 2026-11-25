import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrderEditor } from "@/components/admin/orders/order-editor";
import { requireStaff } from "@/modules/auth/session";
import { getDeliveryConfig } from "@/modules/delivery/data";
import { getAdminOrder } from "@/modules/orders/admin-data";
import { isOrderNo } from "@/modules/orders/orders";
import { canEdit } from "@/modules/orders/staff";

// The signed-in staff member and the live order, on every request.
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/admin/orders/[orderNo]/edit">): Promise<Metadata> {
  const { orderNo } = await params;
  return { title: isOrderNo(orderNo) ? `Edit ${orderNo}` : "Edit order" };
}

export default async function EditOrderPage({ params }: PageProps<"/admin/orders/[orderNo]/edit">) {
  await requireStaff("orders.update");
  const { orderNo } = await params;
  if (!isOrderNo(orderNo)) notFound();
  const [order, config] = await Promise.all([getAdminOrder(orderNo), getDeliveryConfig()]);
  if (!order) notFound();
  // Confirmed (or later) orders are changed through their status, not edited (FR-OR-08).
  if (!canEdit(order.status)) redirect(`/admin/orders/${orderNo}`);

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link
          href={`/admin/orders/${orderNo}`}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden /> {orderNo}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Edit {orderNo}</h1>
        <p className="text-muted-foreground text-sm">
          Every change is saved in the order&apos;s history with your name. Prices of items already on the order stay as
          ordered.
        </p>
      </div>
      <OrderEditor
        order={order}
        districts={config.districts
          .map((d) => ({ id: d.id, name: d.name.en }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        areas={config.areas
          .filter((a) => a.active || a.id === order.address.areaId)
          .map((a) => ({ id: a.id, name: a.name.en, districtId: a.districtId, zoneId: a.zoneId }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        districtZones={Object.fromEntries(config.districts.map((d) => [d.id, d.zoneId]))}
        zones={config.zones}
        rules={config.rules}
      />
    </div>
  );
}
