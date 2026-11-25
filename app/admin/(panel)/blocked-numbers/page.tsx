import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { BlockedNumbers } from "@/components/admin/customers/blocked-numbers";
import { requireStaff } from "@/modules/auth/session";
import { listBlocked } from "@/modules/customers/data";

export const metadata: Metadata = { title: "Blocked numbers" };

// Checks the signed-in staff member on every request (see app/admin/layout.tsx).
export const instant = false;

export default async function BlockedNumbersPage() {
  await requireStaff("customers.block");
  const rows = await listBlocked();
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Blocked numbers"
        description="A blocked number can't get a checkout code or order online. A flagged number can still order; its orders show your note and a higher risk score."
      />
      <BlockedNumbers rows={rows} />
    </div>
  );
}
