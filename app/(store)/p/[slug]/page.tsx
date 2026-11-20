import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductBlocks, SpecsTable } from "@/components/store/product-blocks";
import { ProductDetail } from "@/components/store/product-detail";
import { env } from "@/lib/env";
import { SLUG_RE } from "@/modules/catalog/logic";
import { breadcrumbJsonLd, jsonLdString, productJsonLd, productMetaDescription } from "@/modules/catalog/seo";
import { getPrebuildSlugs, getProductDetail } from "@/modules/catalog/storefront";

/**
 * Product page (FR-PD-01…03, 05, 08). Active products are prebuilt at deploy time; products added later
 * are rendered on their first visit and then cached like the rest. Saving the product in the admin
 * refreshes its page.
 */

export async function generateStaticParams() {
  const slugs = await getPrebuildSlugs();
  // Cache Components needs at least one entry; the placeholder simply shows "not found".
  return slugs.length ? slugs.map((slug) => ({ slug })) : [{ slug: "no-products-yet" }];
}

async function load(slug: string) {
  return slug.length <= 120 && SLUG_RE.test(slug) ? getProductDetail(slug) : null;
}

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) return { title: "Product not found", robots: { index: false } };
  const title = p.seo.title || p.title.en;
  const description = productMetaDescription(p);
  const image = p.seo.ogImage || p.media.find((m) => m.type === "image")?.url;
  return {
    title,
    description,
    alternates: { canonical: `/p/${p.slug}` },
    openGraph: {
      title,
      description,
      url: `/p/${p.slug}`,
      ...(image ? { images: [{ url: image, alt: p.title.en }] } : {}),
    },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
  };
}

export default async function ProductPage({ params }: PageProps<"/p/[slug]">) {
  // No loading boundary on purpose: prebuilt products are sent as complete HTML, and a product added
  // later is rendered on its first request (then saved), so visitors and search engines never see a
  // placeholder. Unknown products get a real 404.
  const { slug } = await params;
  const p = await load(slug);
  if (!p) notFound();

  const base = env().APP_URL;
  const crumbs = [
    { name: "Home", path: "/" },
    ...(p.category ? [{ name: p.category.name, path: `/c/${p.category.slug}` }] : []),
    { name: p.title.en, path: `/p/${p.slug}` },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 pb-28 md:pb-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(productJsonLd(p, base)) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd(crumbs, base)) }}
      />

      <nav aria-label="Breadcrumb" className="text-muted-foreground mb-4 text-sm">
        <ol className="flex flex-wrap items-center gap-1">
          {crumbs.map((c, i) => (
            <li key={c.path} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
              {i < crumbs.length - 1 ? (
                <Link href={c.path} className="hover:text-foreground hover:underline">
                  {c.name}
                </Link>
              ) : (
                <span aria-current="page" className="text-foreground truncate">
                  {c.name}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <ProductDetail product={p} />

      {(p.blocks.length > 0 || p.specs.length > 0) && (
        <div className="mt-14 grid max-w-3xl gap-10 border-t pt-10">
          <ProductBlocks blocks={p.blocks} title={p.title.en} />
          {p.specs.length > 0 && (
            <section aria-labelledby="specs-heading">
              <h2 id="specs-heading" className="mb-3 text-xl font-bold tracking-tight">
                Specifications
              </h2>
              <SpecsTable rows={p.specs} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
