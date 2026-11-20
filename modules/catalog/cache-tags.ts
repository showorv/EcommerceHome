/**
 * Cache tags for storefront data (NFR-SC-02, step 1.15). Storefront reads use `"use cache"` +
 * `cacheTag(...)`; admin saves call `updateTag(...)` so changes show up on the next visit
 * without a redeploy.
 */
export const TAGS = {
  catalog: "catalog", // product lists, cards, search, collections, categories
  product: (slug: string) => `product:${slug}`,
  category: (slug: string) => `category:${slug}`,
  collection: (slug: string) => `collection:${slug}`,
  navigation: "navigation",
  page: (slug: string) => `page:${slug}`, // storefront builder pages (home…)
  design: "design", // menus, footer, announcement bar, theme
} as const;
