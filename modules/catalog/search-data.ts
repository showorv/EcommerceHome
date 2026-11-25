import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connectMongoose } from "@/lib/db/mongo";
import { TAGS } from "./cache-tags";
import { getCategoryTree, namesWithAncestors } from "./category-tree";
import { Product } from "./models";
import { cleanQuery, normalizeText, rankDocs, searchWords, type SearchDoc } from "./search";

/**
 * Search data (FR-SF-08). Every Active product's searchable words are kept in one cached list, so a
 * search never scans the database; saving a product or category in the admin rebuilds it (catalog tag).
 * Comfortable up to several thousand products. A bigger catalogue can move to Atlas Search or
 * Meilisearch by replacing the two functions below.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

type IndexedProduct = SearchDoc & { slug: string; title: string; titleBn: string; price: number; image: string };

async function getSearchIndex(): Promise<{
  products: IndexedProduct[];
  categories: (SearchDoc & { slug: string; name: string })[];
}> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog, TAGS.productLists, TAGS.navigation);
  await connectMongoose();
  const [docs, tree] = await Promise.all([
    Product.find({ status: "active" })
      .select("title slug tags categoryIds sortScore publishedAt priceMin media")
      .lean<AnyDoc[]>(),
    getCategoryTree(),
  ]);

  const products = docs.map((p): IndexedProduct => {
    const title = String(p.title?.en ?? "");
    const titleBn = String(p.title?.bn ?? "");
    const catNames = ((p.categoryIds ?? []) as unknown[]).flatMap((id) => namesWithAncestors(tree, String(id)));
    const image = ((p.media ?? []) as AnyDoc[]).find((m) => m.type === "image")?.url ?? "";
    const published = p.publishedAt ? new Date(p.publishedAt).getTime() : 0;
    return {
      id: String(p._id),
      slug: String(p.slug),
      title,
      titleBn,
      price: Number(p.priceMin ?? 0),
      image: String(image),
      words: searchWords({ strong: [title, titleBn], weak: [...((p.tags ?? []) as string[]), ...catNames] }),
      phrase: normalizeText(`${title} ${titleBn}`),
      // Best sellers first, then newest (the date part is always smaller than one sale).
      rank: Number(p.sortScore ?? 0) + published / 1e14,
    };
  });

  const categories = tree
    .filter((c) => c.active)
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name.en,
      words: searchWords({ strong: [c.name.en, c.name.bn], weak: [] }),
      phrase: normalizeText(`${c.name.en} ${c.name.bn}`),
      rank: 0,
    }));
  return { products, categories };
}

/** Ids of the products matching a search, best match first (at most 500). */
export async function searchProductIds(query: string): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog, TAGS.productLists);
  const q = cleanQuery(query);
  if (!q) return [];
  const { products } = await getSearchIndex();
  return rankDocs(products, q).map((h) => h.id);
}

export type SearchSuggestions = {
  query: string;
  products: { slug: string; title: string; titleBn: string; price: number; image: string }[];
  categories: { slug: string; name: string }[];
};

/** Suggestions while typing: up to 6 products and 4 categories. */
export async function getSuggestions(query: string): Promise<SearchSuggestions> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog, TAGS.productLists, TAGS.navigation);
  const q = cleanQuery(query);
  if (!q) return { query: q, products: [], categories: [] };
  const index = await getSearchIndex();
  const byId = new Map(index.products.map((p) => [p.id, p]));
  const catById = new Map(index.categories.map((c) => [c.id, c]));
  return {
    query: q,
    products: rankDocs(index.products, q, 6).map(({ id }) => {
      const p = byId.get(id)!;
      return { slug: p.slug, title: p.title, titleBn: p.titleBn, price: p.price, image: p.image };
    }),
    categories: rankDocs(index.categories, q, 4).map(({ id }) => {
      const c = catById.get(id)!;
      return { slug: c.slug, name: c.name };
    }),
  };
}
