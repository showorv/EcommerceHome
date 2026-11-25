import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { TemplateEditor } from "@/components/admin/notifications/template-editor";
import { requireStaff } from "@/modules/auth/session";
import { loadBrand } from "@/modules/notifications/brand";
import { loadAllTemplates, loadNotificationSettings } from "@/modules/notifications/data";

export const metadata: Metadata = { title: "Message texts" };

// Checks the signed-in staff member on every request (see app/admin/layout.tsx).
export const instant = false;

export default async function MessageTextsPage() {
  await requireStaff("settings.manage");
  const [templates, settings, brand] = await Promise.all([loadAllTemplates(), loadNotificationSettings(), loadBrand()]);
  return (
    <div className="grid gap-6">
      <Link
        href="/admin/notifications"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden /> Notifications
      </Link>
      <PageHeader
        title="Message texts"
        description="What customers get by SMS and email at each step. {Placeholders} are filled in when the message is sent; the shop name comes from Admin → Invoices."
      />
      <TemplateEditor templates={templates} settings={settings} storeName={brand.name} />
    </div>
  );
}
