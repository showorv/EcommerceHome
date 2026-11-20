import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { ListingHeader, ListingSection, ListingSkeleton } from "@/components/store/listing/listing-section";
import { env } from "@/lib/env";
import { getCollectionPage, getListingSlugs } from "@/modules/catalog/listing-data";
import { SLUG_RE } from "@/modules/catalog/logic";
import { breadcrumbJsonLd, jsonLdString } from "@/modules/catalog/seo";

/**
 * Collection page (FR-SF-07): hand-picked or rule-based product sets ("Under ৳500", "Eid picks")
 * with the same filters and sorting as category pages. Hand-picked collections default to the
 * admin's order ("Featured").
 */

// These pages wait for their (cached) title data before showing, so shoppers and search engines get
// complete HTML instead of a placeholder. Telling Next.js this is intended (instant navigation check).
export const instant = false;

export async function generateStaticParams() {
  const slugs = await getListingSlugs("collection");
  return slugs.length ? slugs.map((slug) => ({ slug })) : [{ slug: "no-collections-yet" }];
}

async function load(slug: string) {
  return slug.length <= 120 && SLUG_RE.test(slug) ? getCollectionPage(slug) : null;
}

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const c = await load(slug);
  if (!c) return { title: "Collection not found", robots: { index: false } };
  const title = c.seo.title || c.name.en;
  const description =
    c.seo.description || c.description.en.slice(0, 160) || `Shop ${c.name.en} with cash on delivery across Bangladesh.`;
  const image = c.seo.ogImage || c.image.url;
  return {
    title,
    description,
    alternates: { canonical: `/collections/${c.slug}` },
    openGraph: { title, description, url: `/collections/${c.slug}`, ...(image ? { images: [{ url: image }] } : {}) },
  };
}

export default async function CollectionPage({ params, searchParams }: PageProps<"/collections/[slug]">) {
  const { slug } = await params;
  const c = await load(slug);
  if (!c) notFound();

  const crumbs = [
    { name: "Home", path: "/" },
    { name: c.name.en, path: `/collections/${c.slug}` },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd(crumbs, env().APP_URL)) }}
      />
      <Breadcrumbs crumbs={crumbs} />
      <ListingHeader title={c.name.en} titleBn={c.name.bn} description={c.description.en} image={c.image} />
      <Suspense fallback={<ListingSkeleton />}>
        <ListingSection
          source={{ kind: "collection", slug: c.slug }}
          basePath={`/collections/${c.slug}`}
          mode={c.listingMode}
          searchParams={searchParams}
        />
      </Suspense>
    </div>
  );
}
