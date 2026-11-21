/**
 * Cache tags for storefront data (NFR-SC-02, step 1.15). Storefront reads use `"use cache"` +
 * `cacheTag(...)`; admin saves call `updateTag(...)` with only the tags their change affects (see
 * productScopeTags below), so the next visit rebuilds just those pages, without a redeploy.
 */
export const TAGS = {
  /** On every catalogue read: refreshes the whole catalogue at once (imports, emergencies). */
  catalog: "catalog",
  /** Lists that can hold any product: home rows (newest, best sellers, deals), search, rule collections. */
  productLists: "product-lists",
  product: (slug: string) => `product:${slug}`,
  category: (slug: string) => `category:${slug}`,
  collection: (slug: string) => `collection:${slug}`,
  navigation: "navigation",
  page: (slug: string) => `page:${slug}`, // storefront builder pages (home…)
  design: "design", // menus, footer, announcement bar, theme
  cmsPage: (slug: string) => `cmsPage:${slug}`, // About, policies, FAQ, Contact…
  cmsPages: "cmsPages", // the list of published CMS pages
  delivery: "delivery", // zones, areas and delivery rules (checkout, delivery preview)
} as const;

const FIXED_TAGS = new Set<string>([
  TAGS.catalog,
  TAGS.productLists,
  TAGS.navigation,
  TAGS.design,
  TAGS.cmsPages,
  TAGS.delivery,
]);
const KEYED_TAG = /^(product|category|collection|page|cmsPage):[a-z0-9][a-z0-9-]{0,199}$/;

/** A tag the store actually uses (the revalidate endpoint accepts nothing else). */
export const isStoreTag = (tag: string) => FIXED_TAGS.has(tag) || KEYED_TAG.test(tag);

/** The store page each tag stands for (to visit it once after a change), or null. */
export function pathForTag(tag: string): string | null {
  if (tag === TAGS.productLists || tag === TAGS.design || tag === TAGS.navigation) return "/";
  const [kind, slug] = tag.split(":");
  if (!slug) return null;
  if (kind === "product") return `/p/${slug}`;
  if (kind === "category") return `/c/${slug}`;
  if (kind === "collection") return `/collections/${slug}`;
  if (kind === "cmsPage") return `/pages/${slug}`;
  if (kind === "page") return slug === "home" ? "/" : null;
  return null;
}

/** At most this many pages are visited after one change; the rest rebuild on their first real visit. */
export const MAX_WARM_PATHS = 30;

/** Pages to visit after a change, most important first (products, then lists and the home page). */
export function warmPaths(tags: Iterable<string>): string[] {
  const paths = [...new Set([...tags].map(pathForTag).filter((p): p is string => p !== null))];
  const rank = (p: string) => (p.startsWith("/p/") ? 0 : p === "/" ? 1 : 2);
  return paths.sort((a, b) => rank(a) - rank(b)).slice(0, MAX_WARM_PATHS);
}

// ---------- What a product change touches ----------

export type ScopeProduct = { id: string; slug: string; categoryIds: string[] };
export type ScopeCategory = { id: string; slug: string; parentId: string | null };
export type ScopeCollection = { slug: string; type: "manual" | "rule"; productIds: string[] };

/**
 * Tags to refresh when products change (saved, status, stock, deleted): each product's page, the pages
 * of its categories and every category above them (a parent page lists its sub-categories' products),
 * the collections that hand-pick it or choose by rules, and the store-wide product lists. Pass the
 * product as it was before the change too, so pages it left are refreshed as well. Other product,
 * category and collection pages stay cached.
 */
export function productScopeTags(
  products: ScopeProduct[],
  categories: ScopeCategory[],
  collections: ScopeCollection[],
): string[] {
  const tags = new Set<string>([TAGS.productLists]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const ids = new Set(products.map((p) => p.id));
  for (const p of products) {
    if (p.slug) tags.add(TAGS.product(p.slug));
    for (const cid of p.categoryIds) {
      let node = byId.get(cid);
      for (let depth = 0; node && depth < 20; depth++) {
        tags.add(TAGS.category(node.slug));
        node = node.parentId ? byId.get(node.parentId) : undefined;
      }
    }
  }
  for (const c of collections) {
    if (c.type === "rule" || c.productIds.some((id) => ids.has(id))) tags.add(TAGS.collection(c.slug));
  }
  return [...tags];
}
