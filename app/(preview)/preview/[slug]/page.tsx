import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StoreShell } from "@/components/store/shell/store-shell";
import { Sections } from "@/components/storefront-sections/sections";
import { requireStaff } from "@/modules/auth/session";
import { getDraftDesign } from "@/modules/storefront/design-data";
import { BUILDER_PAGES, getDraftSections, isBuilderPage } from "@/modules/storefront/pages";

/**
 * Draft preview for the storefront builder and the menus & theme editor (FR-AD-07): the page's draft
 * sections inside the draft menus, footer and theme. Staff with cms.edit only; never indexed or cached.
 * The admin shows it in a frame, so next.config.ts lets this path be framed by the site itself.
 */

export const metadata: Metadata = { title: "Draft preview", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return Object.keys(BUILDER_PAGES).map((slug) => ({ slug }));
}

export default function PreviewPage({ params }: PageProps<"/preview/[slug]">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground p-10 text-center text-sm">Loading preview…</p>}>
      <Draft params={params} />
    </Suspense>
  );
}

async function Draft({ params }: { params: PageProps<"/preview/[slug]">["params"] }) {
  const { slug } = await params;
  if (!isBuilderPage(slug)) notFound();
  await requireStaff("cms.edit");
  const [design, sections] = await Promise.all([getDraftDesign(), getDraftSections(slug)]);
  return (
    <StoreShell
      design={design}
      banner={
        <p className="bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-amber-950">
          Draft preview: the {BUILDER_PAGES[slug].toLowerCase()}, menus and theme. Shoppers don’t see this until it’s
          published.
        </p>
      }
    >
      {sections.length ? (
        <Sections sections={sections} />
      ) : (
        <p className="text-muted-foreground p-16 text-center text-sm">This page has no visible sections.</p>
      )}
    </StoreShell>
  );
}
