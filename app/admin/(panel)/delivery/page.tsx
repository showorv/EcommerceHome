import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { DeliveryEditor } from "@/components/admin/delivery/delivery-editor";
import { tryWriteAudit } from "@/modules/audit/audit";
import { requestMeta, requireStaff } from "@/modules/auth/session";
import { productOptionsForPicker } from "@/modules/catalog/products";
import { ensureDeliverySetup, loadDeliveryData } from "@/modules/delivery/data";

export const metadata: Metadata = { title: "Delivery" };

// Checks the signed-in staff member on every request (see app/admin/layout.tsx).
export const instant = false;

export default async function DeliveryPage() {
  const { user } = await requireStaff("zones.manage");
  // First visit: add Bangladesh's divisions, districts and areas, and three starter zones.
  if (await ensureDeliverySetup()) {
    await tryWriteAudit({
      actor: { id: user.id, email: user.email },
      action: "delivery.setup",
      entity: "deliveryRules",
      entityId: "store",
      after: { note: "Added Bangladesh locations and starter delivery zones" },
      ...(await requestMeta()),
    });
  }
  const [data, products] = await Promise.all([loadDeliveryData(), productOptionsForPicker()]);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Delivery"
        description="Delivery zones and charges, which zone each district and area belongs to, and store-wide rules like free delivery."
      />
      <DeliveryEditor data={data} products={products} />
    </div>
  );
}
