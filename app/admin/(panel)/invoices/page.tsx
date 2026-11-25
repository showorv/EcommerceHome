import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { InvoiceSettingsEditor } from "@/components/admin/invoices/invoice-settings-editor";
import { requireStaff } from "@/modules/auth/session";
import { loadInvoiceSettings } from "@/modules/invoices/data";

export const metadata: Metadata = { title: "Invoices" };

// Checks the signed-in staff member on every request (see app/admin/layout.tsx).
export const instant = false;

export default async function InvoicesPage() {
  await requireStaff("settings.manage");
  const { settings, saved } = await loadInvoiceSettings();
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Invoices"
        description="Every order gets an invoice (INV-year-number) when it is confirmed. The customer's SMS carries a private link to it, with a PDF download."
      />
      {!saved && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Not saved yet: invoices show the store name only. Add your phone and address so customers can reach you.
        </p>
      )}
      <InvoiceSettingsEditor settings={settings} />
    </div>
  );
}
