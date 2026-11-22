import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/modules/catalog/seo";

/**
 * Site-wide search-engine pieces (NFR-UX-01): whether the shop may be indexed, robots.txt, the XML
 * sitemap and the Organization / WebSite structured data on the home page. Pure functions.
 */

/** Shared when a page has no picture of its own (WhatsApp, Facebook, Messenger previews). */
export const DEFAULT_SHARE_IMAGE = "/share-image";

/** Pages that are only useful to the visitor who opened them, or to staff. */
const PRIVATE_PATHS = ["/admin", "/api/", "/account", "/cart", "/checkout", "/track", "/preview", "/i/", "/search"];

export function searchIndexing(setting: string | undefined, appUrl: string): boolean {
  if (setting === "on") return true;
  if (setting === "off") return false;
  return appUrl.startsWith("https://");
}

export function robotsFor(indexing: boolean, base: string): MetadataRoute.Robots {
  if (!indexing) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }],
    sitemap: absoluteUrl("/sitemap.xml", base),
    host: new URL(base).origin,
  };
}

export type SitemapData = {
  products: { slug: string; updatedAt: string; image: string | null }[];
  categories: string[];
  collections: string[];
  pages: { slug: string; updatedAt: string }[];
};

export function sitemapFor(data: SitemapData, base: string): MetadataRoute.Sitemap {
  const url = (path: string) => absoluteUrl(path, base);
  const newest = data.products.reduce<string | undefined>(
    (m, p) => (!m || p.updatedAt > m ? p.updatedAt : m),
    undefined,
  );
  return [
    { url: url("/"), lastModified: newest, changeFrequency: "daily", priority: 1 },
    ...data.categories.map((slug) => ({
      url: url(`/c/${slug}`),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...data.collections.map((slug) => ({
      url: url(`/collections/${slug}`),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...data.products.map((p) => ({
      url: url(`/p/${p.slug}`),
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
      ...(p.image ? { images: [absoluteUrl(p.image, base)] } : {}),
    })),
    ...data.pages.map((p) => ({
      url: url(`/pages/${p.slug}`),
      lastModified: p.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.3,
    })),
  ];
}

export function organizationJsonLd(o: {
  name: string;
  base: string;
  logo: string | null;
  phone: string;
  email: string;
  sameAs: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: o.name,
    url: absoluteUrl("/", o.base),
    ...(o.logo ? { logo: absoluteUrl(o.logo, o.base) } : {}),
    ...(o.phone || o.email
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "customer service",
            areaServed: "BD",
            ...(o.phone ? { telephone: o.phone } : {}),
            ...(o.email ? { email: o.email } : {}),
          },
        }
      : {}),
    ...(o.sameAs.length ? { sameAs: o.sameAs } : {}),
  };
}

/** Lets Google show a search box for the shop under its result. */
export function websiteJsonLd(name: string, base: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url: absoluteUrl("/", base),
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl("/search", base)}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * A page's share preview. Next.js replaces (not merges) the parent's openGraph, so every page builds
 * its whole set here: the site name, and the default picture when the page has none of its own.
 */
export function shareMeta(o: {
  siteName: string;
  title: string;
  description: string;
  /** The page's own address; left out for the site-wide default. */
  path?: string;
  image?: string | null;
  imageAlt?: string;
  type?: "website" | "article";
}) {
  const image = o.image || DEFAULT_SHARE_IMAGE;
  return {
    openGraph: {
      type: o.type ?? "website",
      siteName: o.siteName,
      locale: "en_BD",
      title: o.title,
      description: o.description,
      ...(o.path ? { url: o.path } : {}),
      images: [{ url: image, ...(o.image ? {} : { width: 1200, height: 630 }), alt: o.imageAlt ?? o.title }],
    },
    twitter: { card: "summary_large_image" as const, title: o.title, description: o.description, images: [image] },
  };
}
