import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { StorefrontBuilder } from "@/components/admin/storefront/builder";
import { requireStaff } from "@/modules/auth/session";
import { getBuilderOptions, getPageForEdit } from "@/modules/storefront/pages";

export const metadata: Metadata = { title: "Storefront" };

// Checks the signed-in staff member on every request (see app/admin/layout.tsx).
export const instant = false;

export default async function StorefrontPage() {
  const { permissions } = await requireStaff("cms.edit");
  const [page, options] = await Promise.all([getPageForEdit("home"), getBuilderOptions()]);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Storefront"
        description="Build the home page from sections. Changes stay in a draft until you publish them."
      />
      <StorefrontBuilder initial={page} options={options} canPublish={permissions.has("cms.publish")} />
    </div>
  );
}
