import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { DesignEditor } from "@/components/admin/storefront/design-editor";
import { requireStaff } from "@/modules/auth/session";
import { getDesignForEdit } from "@/modules/storefront/design-data";
import { getBuilderOptions } from "@/modules/storefront/pages";

export const metadata: Metadata = { title: "Menus & theme" };

// Checks the signed-in staff member on every request (see app/admin/layout.tsx).
export const instant = false;

export default async function AppearancePage() {
  const { permissions } = await requireStaff("cms.edit");
  const [state, options] = await Promise.all([getDesignForEdit(), getBuilderOptions()]);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Menus & theme"
        description="Header menu, footer, announcement bar, colours, fonts and logo. Changes stay in a draft until you publish them."
      />
      <DesignEditor
        initial={state}
        options={{ links: options.links, categoryTree: options.categoryTree }}
        canPublish={permissions.has("cms.publish")}
      />
    </div>
  );
}
