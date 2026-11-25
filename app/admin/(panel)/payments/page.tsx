import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { PaymentsEditor } from "@/components/admin/payments/payments-editor";
import { requireStaff } from "@/modules/auth/session";
import { loadPaymentSettings } from "@/modules/payments/data";

export const metadata: Metadata = { title: "Payments" };

// Checks the signed-in staff member on every request (see app/admin/layout.tsx).
export const instant = false;

export default async function PaymentsPage() {
  await requireStaff("settings.manage");
  const settings = await loadPaymentSettings();
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Payments"
        description="The bKash and Nagad numbers customers send advance payments to. Checkout shows the amount, the number and the QR, and asks for the sender number and TrxID."
      />
      <PaymentsEditor settings={settings} />
    </div>
  );
}
