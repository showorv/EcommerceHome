import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Sections } from "@/components/storefront-sections/sections";
import { requireStaff } from "@/modules/auth/session";
import { BUILDER_PAGES, getDraftSections, isBuilderPage } from "@/modules/storefront/pages";

/**
 * Draft preview for the storefront builder (FR-AD-07). Staff with cms.edit only; never indexed or
 * cached. The builder shows it in a frame, so next.config.ts lets this path be framed by the site itself.
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
  const sections = await getDraftSections(slug);
  return (
    <>
      <p className="sticky top-14 z-30 bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-amber-950">
        Draft preview of the {BUILDER_PAGES[slug].toLowerCase()}. Shoppers don’t see this until it’s published.
      </p>
      {sections.length ? (
        <Sections sections={sections} />
      ) : (
        <p className="text-muted-foreground p-16 text-center text-sm">This page has no visible sections.</p>
      )}
    </>
  );
}
