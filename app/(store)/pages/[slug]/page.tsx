import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CmsPageView } from "@/components/cms/cms-page";
import { env } from "@/lib/env";
import { SLUG_RE } from "@/modules/catalog/logic";
import { breadcrumbJsonLd, jsonLdString } from "@/modules/catalog/seo";
import { plainText } from "@/modules/cms/blocks";
import { getLivePage, getLivePageList } from "@/modules/cms/pages";
import { getLiveDesign } from "@/modules/storefront/design-data";
import { shareMeta } from "@/modules/seo/site";

/**
 * CMS pages: About, Privacy, Terms, Returns, Shipping, FAQ, Contact and custom pages (FR-SF-09).
 * Published pages are prebuilt; publishing, unpublishing or deleting one in the admin refreshes it.
 */

// Waits for its (cached) data so shoppers and search engines get complete HTML (instant navigation check).
export const instant = false;

export async function generateStaticParams() {
  const pages = await getLivePageList();
  // Cache Components needs at least one entry; the placeholder simply shows "not found".
  return pages.length ? pages.map((p) => ({ slug: p.slug })) : [{ slug: "no-pages-yet" }];
}

async function load(slug: string) {
  return slug.length <= 60 && SLUG_RE.test(slug) ? getLivePage(slug) : null;
}

export async function generateMetadata({ params }: PageProps<"/pages/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) return { title: "Page not found", robots: { index: false } };
  const title = page.seoTitle || page.title;
  const description = page.seoDescription || plainText(page.blocks);
  return {
    title,
    description,
    alternates: { canonical: `/pages/${page.slug}` },
    ...shareMeta({ siteName: env().STORE_NAME, title, description, path: `/pages/${page.slug}`, type: "article" }),
  };
}

export default async function CmsPage({ params }: PageProps<"/pages/[slug]">) {
  const { slug } = await params;
  const [page, design] = await Promise.all([load(slug), getLiveDesign()]);
  if (!page) notFound();
  const crumbs = [
    { name: "Home", path: "/" },
    { name: page.title, path: `/pages/${page.slug}` },
  ];
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd(crumbs, env().APP_URL)) }}
      />
      <CmsPageView content={page} footer={design.navigation.footer} updatedAt={page.updatedAt} />
    </>
  );
}
