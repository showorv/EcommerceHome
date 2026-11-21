import "server-only";
import { updateTag } from "next/cache";
import { after } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { productScopeTags, warmPaths, type ScopeProduct } from "./cache-tags";
import { Category, Collection, Product } from "./models";

/**
 * On-demand revalidation for catalogue changes (NFR-SC-02). Server actions call these after a change;
 * only the store pages that show the changed data are rebuilt on their next visit.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** Products as the cache tags need them: id, address and categories. Includes soft-deleted ones. */
export async function scopeOfProducts(productIds: string[]): Promise<ScopeProduct[]> {
  if (productIds.length === 0) return [];
  await connectMongoose();
  const docs = await Product.find(trustFilter({ _id: { $in: productIds } }))
    .setOptions({ withDeleted: true })
    .select("slug categoryIds")
    .lean<AnyDoc[]>();
  return docs.map((d) => ({ id: String(d._id), slug: String(d.slug ?? ""), categoryIds: ids(d.categoryIds) }));
}

/** The tags a change to these products touches. Give the "before" copy too when slug or categories changed. */
export async function productTags(products: ScopeProduct[]): Promise<string[]> {
  await connectMongoose();
  const productIds = [...new Set(products.map((p) => p.id))];
  // Read straight from the database: the cached tree could be older than this change.
  const [cats, cols] = await Promise.all([
    Category.find().setOptions({ withDeleted: true }).select("slug parentId").lean<AnyDoc[]>(),
    Collection.find(trustFilter({ $or: [{ type: "rule" }, { productIds: { $in: productIds } }] }))
      .select("slug type productIds")
      .lean<AnyDoc[]>(),
  ]);
  return productScopeTags(
    products,
    cats.map((c) => ({ id: String(c._id), slug: String(c.slug), parentId: c.parentId ? String(c.parentId) : null })),
    cols.map((c) => ({
      slug: String(c.slug),
      type: c.type === "rule" ? "rule" : "manual",
      productIds: ids(c.productIds),
    })),
  );
}

/**
 * Marks the tags stale (server actions only), then, after the reply is sent, visits each affected
 * store page once. A fully cached page (product pages, the home page) hands its first visitor after a
 * change the old copy while it rebuilds; that visit is ours, so shoppers get the new page.
 */
export function refreshTags(tags: Iterable<string>) {
  const unique = [...new Set(tags)];
  for (const t of unique) updateTag(t);
  warmAfterResponse(unique);
}

/** Visits the store pages behind these tags once, after the response (also used by the revalidate endpoint). */
export function warmAfterResponse(tags: string[]) {
  const paths = warmPaths(tags);
  if (paths.length === 0) return;
  after(async () => {
    const base = env().APP_URL;
    for (const path of paths) {
      try {
        const res = await fetch(new URL(path, base), {
          headers: { "x-store-warmup": "1" },
          signal: AbortSignal.timeout(15_000),
        });
        await res.arrayBuffer(); // read to the end so the render finishes and is stored
      } catch (err) {
        logger.warn({ err, path }, "store page warm-up failed");
        return; // the store isn't reachable from here; pages rebuild on their first real visit
      }
    }
  });
}
