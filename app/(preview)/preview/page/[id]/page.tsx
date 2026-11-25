import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CmsPageView } from "@/components/cms/cms-page";
import { StoreShell } from "@/components/store/shell/store-shell";
import { requireStaff } from "@/modules/auth/session";
import { getPageForEdit } from "@/modules/cms/pages";
import { getLiveDesign } from "@/modules/storefront/design-data";

/**
 * Draft preview of a CMS page (FR-SF-09), inside the live menus, footer and theme. Staff with cms.edit
 * only; never indexed or cached. The page editor shows it in a frame (next.config.ts allows that for
 * /preview/*).
 */

export const metadata: Metadata = { title: "Draft preview", robots: { index: false, follow: false } };

export function generateStaticParams() {
  // Cache Components needs at least one entry; real ids render on request.
  return [{ id: "none" }];
}

export default function CmsPreviewPage({ params }: PageProps<"/preview/page/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground p-10 text-center text-sm">Loading preview…</p>}>
      <Draft params={params} />
    </Suspense>
  );
}

async function Draft({ params }: { params: PageProps<"/preview/page/[id]">["params"] }) {
  const { id } = await params;
  await requireStaff("cms.edit");
  const [page, design] = await Promise.all([getPageForEdit(id), getLiveDesign()]);
  if (!page) notFound();
  return (
    <StoreShell
      design={design}
      banner={
        <p className="bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-amber-950">
          Draft preview of this page. Shoppers don’t see these changes until it’s published.
        </p>
      }
    >
      <CmsPageView content={page.draft.content} footer={design.navigation.footer} updatedAt={null} />
    </StoreShell>
  );
}
