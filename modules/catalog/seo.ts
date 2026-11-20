import type { ProductDetail } from "./storefront";

/**
 * Search-engine data for the product page (FR-PD-08): meta description and schema.org JSON-LD
 * (Product + BreadcrumbList), so Google can show price, stock and rating in results. Pure functions.
 */

const taka = (poisha: number) => (poisha / 100).toFixed(2);

export function absoluteUrl(url: string, base: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return new URL(url, base).toString();
}

/** SEO description, else short description, else the first text block; trimmed to ~160 characters. */
export function productMetaDescription(p: Pick<ProductDetail, "seo" | "shortDescription" | "blocks">): string {
  const firstText = p.blocks.find((b) => b.type === "text");
  const raw =
    p.seo.description || p.shortDescription.en || (firstText && firstText.type === "text" ? firstText.body : "");
  const clean = raw.replace(/\s+/g, " ").trim();
  if (clean.length <= 160) return clean;
  const cut = clean.slice(0, 157);
  return cut.slice(0, cut.lastIndexOf(" ") > 120 ? cut.lastIndexOf(" ") : 157) + "…";
}

export function productJsonLd(p: ProductDetail, base: string) {
  const url = absoluteUrl(`/p/${p.slug}`, base);
  const images = p.media.filter((m) => m.type === "image").map((m) => absoluteUrl(m.url, base));
  const inStock = p.variants.some((v) => v.available > 0);
  const availability = `https://schema.org/${inStock ? "InStock" : "OutOfStock"}`;
  const prices = p.variants.map((v) => v.price);
  const offers =
    p.variants.length <= 1
      ? {
          "@type": "Offer",
          url,
          priceCurrency: "BDT",
          price: taka(prices[0] ?? 0),
          availability,
          itemCondition: "https://schema.org/NewCondition",
        }
      : {
          "@type": "AggregateOffer",
          url,
          priceCurrency: "BDT",
          lowPrice: taka(Math.min(...prices)),
          highPrice: taka(Math.max(...prices)),
          offerCount: p.variants.length,
          availability,
        };
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title.en,
    url,
    ...(images.length ? { image: images } : {}),
    description: productMetaDescription(p),
    ...(p.category ? { category: p.category.name } : {}),
    offers,
    ...(p.ratingCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: p.ratingAvg.toFixed(1),
            reviewCount: p.ratingCount,
          },
        }
      : {}),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[], base: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path, base),
    })),
  };
}

/** JSON for a <script type="application/ld+json">; "<" is escaped so text can never close the script tag. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
