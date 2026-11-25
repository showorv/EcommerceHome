import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/catalog/form-bits";
import { CmsPageEditor } from "@/components/admin/cms/page-editor";
import { requireStaff } from "@/modules/auth/session";
import { getPageForEdit } from "@/modules/cms/pages";

export const metadata: Metadata = { title: "Edit page" };

// Checks the signed-in staff member on every request (see app/admin/layout.tsx).
export const instant = false;

export default async function EditCmsPage({ params }: PageProps<"/admin/pages/[id]">) {
  const { permissions } = await requireStaff("cms.edit");
  const { id } = await params;
  const page = await getPageForEdit(id);
  if (!page) notFound();
  return (
    <div className="grid gap-6">
      <Link
        href="/admin/pages"
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden /> All pages
      </Link>
      <PageHeader title={page.draft.content.title || "Untitled page"} />
      <CmsPageEditor key={page.id} initial={page} canPublish={permissions.has("cms.publish")} />
    </div>
  );
}
