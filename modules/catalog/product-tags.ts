import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { productScopeTags, type ScopeProduct } from "./cache-tags";
import { Category, Collection, Product } from "./models";

/**
 * The store cache tags a change to some products touches (NFR-SC-02). Not marked server-only, so the
 * worker can send them to /api/internal/revalidate after stock it released.
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
