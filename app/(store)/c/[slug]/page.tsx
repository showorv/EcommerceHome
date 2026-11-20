import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { ListingHeader, ListingSection, ListingSkeleton } from "@/components/store/listing/listing-section";
import { env } from "@/lib/env";
import { getCategoryPage, getListingSlugs } from "@/modules/catalog/listing-data";
import { SLUG_RE } from "@/modules/catalog/logic";
import { breadcrumbJsonLd, jsonLdString } from "@/modules/catalog/seo";

/**
 * Category page (FR-SF-07): products in the category and all its sub-categories, with filters,
 * sorting and numbered pages or infinite scroll (chosen per category in the admin).
 * The title area is prebuilt; the product list follows the URL's filters.
 */

// These pages wait for their (cached) title data before showing, so shoppers and search engines get
// complete HTML instead of a placeholder. Telling Next.js this is intended (instant navigation check).
export const instant = false;

export async function generateStaticParams() {
  const slugs = await getListingSlugs("category");
  // Cache Components needs at least one entry; the placeholder simply shows "not found".
  return slugs.length ? slugs.map((slug) => ({ slug })) : [{ slug: "no-categories-yet" }];
}

async function load(slug: string) {
  return slug.length <= 120 && SLUG_RE.test(slug) ? getCategoryPage(slug) : null;
}

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const c = await load(slug);
  if (!c) return { title: "Category not found", robots: { index: false } };
  const title = c.seo.title || c.name.en;
  const description =
    c.seo.description || c.description.en.slice(0, 160) || `Shop ${c.name.en} with cash on delivery across Bangladesh.`;
  const image = c.seo.ogImage || c.image.url;
  return {
    title,
    description,
    alternates: { canonical: `/c/${c.slug}` },
    openGraph: { title, description, url: `/c/${c.slug}`, ...(image ? { images: [{ url: image }] } : {}) },
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/c/[slug]">) {
  const { slug } = await params;
  const c = await load(slug);
  if (!c) notFound();

  const crumbs = [
    { name: "Home", path: "/" },
    ...c.trail.map((t) => ({ name: t.name, path: `/c/${t.slug}` })),
    { name: c.name.en, path: `/c/${c.slug}` },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd(crumbs, env().APP_URL)) }}
      />
      <Breadcrumbs crumbs={crumbs} />
      <ListingHeader
        title={c.name.en}
        titleBn={c.name.bn}
        description={c.description.en}
        image={c.image}
        links={c.children.map((ch) => ({ name: ch.name, href: `/c/${ch.slug}`, image: ch.image }))}
      />
      <Suspense fallback={<ListingSkeleton />}>
        <ListingSection
          source={{ kind: "category", slug: c.slug }}
          basePath={`/c/${c.slug}`}
          mode={c.listingMode}
          searchParams={searchParams}
        />
      </Suspense>
    </div>
  );
}
