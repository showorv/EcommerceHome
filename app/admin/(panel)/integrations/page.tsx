import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { IntegrationCard } from "@/components/admin/integrations/integration-card";
import { requireStaff } from "@/modules/auth/session";
import { integrationViews } from "@/modules/integrations/store";

export const metadata: Metadata = { title: "Integrations" };

// Checks the signed-in staff member on every request; settings are read fresh every time.
export const instant = false;

/** Integrations (FR-AD-12): SMS, email, courier and media storage keys, stored encrypted. */
export default async function IntegrationsPage() {
  await requireStaff("integrations.manage");
  const views = await integrationViews();
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Integrations"
        description="Keys for SMS, email, the courier and media storage. Keys are stored encrypted and never shown in full again after saving. Changes take effect within about 30 seconds."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {views.map((v) => (
          <IntegrationCard key={v.id} view={v} />
        ))}
      </div>
    </div>
  );
}
