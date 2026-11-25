import "server-only";
import { getCategoryTree } from "@/modules/catalog/category-tree";
import { EMPTY_QUERY } from "@/modules/catalog/listing";
import { getListing } from "@/modules/catalog/listing-data";
import type { CardProduct } from "@/modules/catalog/storefront";
import type { MenuItem } from "./design";
import { isMega, previewSource } from "./design-links";

/**
 * Product previews for the header menu: hovering a category or collection shows a few of its products,
 * with its sub-categories on the side (each with its own products). Built from the cached listings, so
 * it costs nothing extra once those are warm. Only public card fields are sent to the browser.
 */

export type PreviewCard = {
  id: string;
  slug: string;
  title: string;
  price: number;
  priceMax: number;
  compareAt: number;
  discount: number;
  image: { url: string; alt: string; blur: string; focalX: number; focalY: number } | null;
  hoverImage: string | null;
};

export type PreviewLink = { label: string; href: string };

export type MenuPreview = {
  /** Sub-categories (or the item's own menu links) shown on the left. */
  links: PreviewLink[];
  /** Products per link href, plus the item's own href. */
  products: Record<string, PreviewCard[]>;
};

const PER_LIST = 4;

function toPreviewCard(p: CardProduct): PreviewCard {
  const first = p.media.find((m) => m.type === "image") ?? null;
  const second = p.media.find((m, i) => i > 0 && m.type === "image") ?? null;
  return {
    id: p.id,
    slug: p.slug,
    title: p.title.en,
    price: p.price,
    priceMax: p.priceMax,
    compareAt: p.compareAt,
    discount: p.discount,
    image: first
      ? { url: first.url, alt: first.alt, blur: first.blur, focalX: first.focalX, focalY: first.focalY }
      : null,
    hoverImage: second?.url ?? null,
  };
}

async function productsFor(href: string): Promise<PreviewCard[]> {
  const source = previewSource(href);
  if (!source) return [];
  const listing = await getListing(source, EMPTY_QUERY);
  return listing.products.slice(0, PER_LIST).map(toPreviewCard);
}

/** Previews keyed by menu item id. Items with a column mega-menu of their own keep that instead. */
export async function getMenuPreviews(items: MenuItem[]): Promise<Record<string, MenuPreview>> {
  const tree = await getCategoryTree();
  const out: Record<string, MenuPreview> = {};
  await Promise.all(
    items.map(async (item) => {
      const source = item.href ? previewSource(item.href) : null;
      if (!source || isMega(item)) return;

      let links: PreviewLink[] = item.children.filter((c) => c.href).map((c) => ({ label: c.label, href: c.href }));
      if (links.length === 0 && source.kind === "category") {
        const cat = tree.find((c) => c.slug === source.slug);
        links = cat
          ? tree
              .filter((c) => c.parentId === cat.id && c.active)
              .slice(0, 8)
              .map((c) => ({ label: c.name.en, href: `/c/${c.slug}` }))
          : [];
      }

      const hrefs = [item.href, ...links.map((l) => l.href)];
      const lists = await Promise.all(hrefs.map(productsFor));
      if (lists[0]!.length === 0) return; // nothing to show: the item stays a plain link
      out[item.id] = {
        links,
        products: Object.fromEntries(hrefs.map((h, i) => [h, lists[i]!])),
      };
    }),
  );
  return out;
}
