import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connectMongoose } from "@/lib/db/mongo";
import { TAGS } from "./cache-tags";
import { Category } from "./models";

/** The category tree for the storefront (listing pages, filters, search), cached and tagged. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

export type ListingMode = "pagination" | "infinite";

export type I18n = { en: string; bn: string };
export const i18n = (v: AnyDoc | undefined): I18n => ({ en: String(v?.en ?? ""), bn: String(v?.bn ?? "") });
export const seoOf = (v: AnyDoc | undefined) => ({
  title: String(v?.title ?? ""),
  description: String(v?.description ?? ""),
  ogImage: String(v?.ogImage ?? ""),
});

export type TreeNode = {
  id: string;
  slug: string;
  name: I18n;
  parentId: string | null;
  active: boolean;
  description: I18n;
  image: { url: string; alt: string };
  seo: { title: string; description: string; ogImage: string };
  listingMode: ListingMode;
};

export async function getCategoryTree(): Promise<TreeNode[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog, TAGS.navigation);
  await connectMongoose();
  const docs = await Category.find().sort({ order: 1, "name.en": 1 }).lean<AnyDoc[]>();
  return docs.map((c) => ({
    id: String(c._id),
    slug: String(c.slug),
    name: i18n(c.name),
    parentId: c.parentId ? String(c.parentId) : null,
    active: c.active !== false,
    description: i18n(c.description),
    image: { url: String(c.image?.url ?? ""), alt: String(c.image?.alt ?? "") },
    seo: seoOf(c.seo),
    listingMode: c.listingMode === "infinite" ? "infinite" : "pagination",
  }));
}

/** The category and everything below it (products in a hidden sub-category still show in the parent). */
export function withDescendants(tree: TreeNode[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length && out.length < 500; i++) {
    for (const c of tree) if (c.parentId === out[i] && !out.includes(c.id)) out.push(c.id);
  }
  return out;
}

/** The category's name and the names of every category above it (for search words). */
export function namesWithAncestors(tree: TreeNode[], id: string): string[] {
  const out: string[] = [];
  let node = tree.find((c) => c.id === id);
  for (let i = 0; node && i < 10; i++) {
    if (node.active) out.push(node.name.en, node.name.bn);
    const parentId = node.parentId;
    node = parentId ? tree.find((c) => c.id === parentId) : undefined;
  }
  return out.filter(Boolean);
}
