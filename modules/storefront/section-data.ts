import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connectMongoose } from "@/lib/db/mongo";
import { TAGS } from "@/modules/catalog/cache-tags";
import { getCategoryTree } from "@/modules/catalog/category-tree";
import { EMPTY_QUERY } from "@/modules/catalog/listing";
import { getListing } from "@/modules/catalog/listing-data";
import { Collection } from "@/modules/catalog/models";
import { getCardProducts, type CardProduct } from "@/modules/catalog/storefront";
import type { SectionData } from "./sections";

/** Data the storefront sections need, read with the same cached storefront functions as the pages. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

/** Active collections by id (for sections that point at a collection). */
export async function getCollectionRefs(): Promise<Record<string, { slug: string; name: string }>> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog, TAGS.navigation);
  await connectMongoose();
  const docs = await Collection.find({ active: true }).select("slug name").lean<AnyDoc[]>();
  return Object.fromEntries(
    docs.map((d) => [String(d._id), { slug: String(d.slug), name: String(d.name?.en ?? d.slug) }]),
  );
}

export type SectionProducts = { products: CardProduct[]; viewAllHref: string | null };

/** Products for a "Products" section. A missing or switched-off collection/category shows nothing. */
export async function getSectionProducts(d: SectionData<"productCarousel">): Promise<SectionProducts> {
  const limit = Math.min(Math.max(d.limit, 1), 24);
  if (d.source === "newest" || d.source === "bestselling" || d.source === "discount") {
    // No "all products" page yet, so these rows have no "View all" link.
    return { products: await getCardProducts({ sort: d.source, limit }), viewAllHref: null };
  }
  if (d.source === "category") {
    const node = (await getCategoryTree()).find((c) => c.id === d.refId && c.active);
    if (!node) return { products: [], viewAllHref: null };
    const r = await getListing({ kind: "category", slug: node.slug }, EMPTY_QUERY);
    return { products: r.products.slice(0, limit), viewAllHref: `/c/${node.slug}` };
  }
  const ref = (await getCollectionRefs())[d.refId];
  if (!ref) return { products: [], viewAllHref: null };
  const r = await getListing({ kind: "collection", slug: ref.slug }, EMPTY_QUERY);
  return { products: r.products.slice(0, limit), viewAllHref: `/collections/${ref.slug}` };
}

export type CategoryTile = { slug: string; name: string; nameBn: string; image: string };

/** Tiles for a category grid: the chosen ones in the chosen order, or every visible top-level category. */
export async function getCategoryTiles(ids: string[]): Promise<CategoryTile[]> {
  const tree = (await getCategoryTree()).filter((c) => c.active);
  const nodes = ids.length
    ? ids.flatMap((id) => tree.filter((c) => c.id === id))
    : tree.filter((c) => c.parentId === null);
  return nodes.map((c) => ({ slug: c.slug, name: c.name.en, nameBn: c.name.bn, image: c.image.url }));
}
