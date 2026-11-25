import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { CmsPageEditor } from "@/components/admin/cms/page-editor";
import { requireStaff } from "@/modules/auth/session";

export const metadata: Metadata = { title: "New page" };

// Checks the signed-in staff member on every request (see app/admin/layout.tsx).
export const instant = false;

export default async function NewCmsPage() {
  const { permissions } = await requireStaff("cms.edit");
  return (
    <div className="grid gap-6">
      <PageHeader
        title="New page"
        description="Give it a title, add blocks, then create it. It stays hidden until published."
      />
      <CmsPageEditor initial={null} canPublish={permissions.has("cms.publish")} />
    </div>
  );
}
