import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { OrderRulesEditor } from "@/components/admin/order-rules/order-rules-editor";
import { requireStaff } from "@/modules/auth/session";
import { getDeliveryConfig } from "@/modules/delivery/data";
import { loadOrderRules } from "@/modules/orders/rules-data";
import { loadPaymentSettings } from "@/modules/payments/data";

export const metadata: Metadata = { title: "Order rules" };

// Checks the signed-in staff member on every request (see app/admin/layout.tsx).
export const instant = false;

export default async function OrderRulesPage() {
  await requireStaff("settings.manage");
  const [config, payments] = await Promise.all([getDeliveryConfig(), loadPaymentSettings()]);
  const { rules, saved } = await loadOrderRules(config.zones);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Order rules"
        description="Which orders pay an advance before you ship, and how long a new order holds its stock. Every order also gets a risk score your team sees when confirming it."
      />
      <OrderRulesEditor
        rules={rules}
        saved={saved}
        zones={config.zones.map((z) => ({ id: z.id, name: z.name, active: z.active, advanceRule: z.advanceRule }))}
        walletsOn={payments.wallets.filter((w) => w.active).length}
      />
    </div>
  );
}
