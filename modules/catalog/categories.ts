import "server-only";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { slugify, uniqueSlug } from "./logic";
import { Category, Product } from "./models";
import type { CategoryInput } from "./schemas";

/** Categories (FR-AD-03). Callers check permissions, write the audit log and update cache tags. */

export type CategoryRow = {
  id: string;
  name: { en: string; bn: string };
  slug: string;
  parentId: string | null;
  description: { en: string; bn: string };
  image: { url: string; alt: string };
  order: number;
  listingMode: "pagination" | "infinite";
  active: boolean;
  seo: { title: string; description: string; ogImage: string };
  productCount: number;
  depth: number;
};

type Lean = {
  _id: { toString(): string };
  name: { en: string; bn?: string };
  slug: string;
  parentId?: { toString(): string } | null;
  description?: { en?: string; bn?: string };
  image?: { url?: string; alt?: string };
  order?: number;
  listingMode?: "pagination" | "infinite";
  active?: boolean;
  seo?: { title?: string; description?: string; ogImage?: string };
};

function toRow(c: Lean, productCount = 0, depth = 0): CategoryRow {
  return {
    id: c._id.toString(),
    name: { en: c.name.en, bn: c.name.bn ?? "" },
    slug: c.slug,
    parentId: c.parentId ? c.parentId.toString() : null,
    description: { en: c.description?.en ?? "", bn: c.description?.bn ?? "" },
    image: { url: c.image?.url ?? "", alt: c.image?.alt ?? "" },
    order: c.order ?? 0,
    listingMode: c.listingMode ?? "pagination",
    active: c.active ?? true,
    seo: { title: c.seo?.title ?? "", description: c.seo?.description ?? "", ogImage: c.seo?.ogImage ?? "" },
    productCount,
    depth,
  };
}

/** All categories as a flat list in tree order (parents first, children indented by `depth`). */
export async function listCategories(): Promise<CategoryRow[]> {
  await connectMongoose();
  const [cats, counts] = await Promise.all([
    Category.find().sort({ order: 1, "name.en": 1 }).lean<Lean[]>(),
    Product.aggregate<{ _id: unknown; n: number }>([
      { $match: { deletedAt: null } },
      { $unwind: "$categoryIds" },
      { $group: { _id: "$categoryIds", n: { $sum: 1 } } },
    ]),
  ]);
  const countOf = new Map(counts.map((c) => [String(c._id), c.n]));
  const byParent = new Map<string, Lean[]>();
  for (const c of cats) {
    const key = c.parentId ? c.parentId.toString() : "root";
    byParent.set(key, [...(byParent.get(key) ?? []), c]);
  }
  const out: CategoryRow[] = [];
  const ids = new Set(cats.map((c) => c._id.toString()));
  const walk = (key: string, depth: number) => {
    for (const c of byParent.get(key) ?? []) {
      out.push(toRow(c, countOf.get(c._id.toString()) ?? 0, depth));
      if (depth < 5) walk(c._id.toString(), depth + 1);
    }
  };
  walk("root", 0);
  // Orphans (parent was deleted) are shown at the top level.
  for (const c of cats) {
    if (c.parentId && !ids.has(c.parentId.toString())) out.push(toRow(c, countOf.get(c._id.toString()) ?? 0, 0));
  }
  return out;
}

export async function getCategory(id: string): Promise<CategoryRow | null> {
  await connectMongoose();
  const c = await Category.findById(id).lean<Lean>();
  return c ? toRow(c) : null;
}

async function slugTaken(slug: string, exceptId?: string) {
  const found = await Category.findOne({ slug }).setOptions({ withDeleted: true }).select("_id").lean<Lean>();
  return !!found && found._id.toString() !== exceptId;
}

/** Creates or updates a category. Returns the saved row and the previous one (for the audit log). */
export async function saveCategory(id: string | null, input: CategoryInput) {
  await connectMongoose();
  const before = id ? await getCategory(id) : null;
  if (id && !before) throw new CatalogError("Category not found.");

  const wanted = input.slug || slugify(input.name.en);
  if (input.slug && (await slugTaken(input.slug, id ?? undefined)))
    throw new CatalogError("That URL slug is already used.");
  const slug = input.slug ? input.slug : await uniqueSlug(wanted, (s) => slugTaken(s, id ?? undefined));

  const parentId = input.parentId || null;
  if (parentId && id) {
    if (parentId === id) throw new CatalogError("A category can't be its own parent.");
    if (await isDescendant(parentId, id))
      throw new CatalogError("A category can't be moved under its own sub-category.");
  }

  const doc = { ...input, slug, parentId };
  const saved = id
    ? await Category.findByIdAndUpdate(id, doc, { new: true, runValidators: true }).lean<Lean>()
    : ((await Category.create(doc)).toObject() as Lean);
  if (!saved) throw new CatalogError("Category not found.");
  return { before, after: toRow(saved) };
}

/** True when `candidateId` sits somewhere below `ancestorId`. */
async function isDescendant(candidateId: string, ancestorId: string): Promise<boolean> {
  let current: string | null = candidateId;
  for (let i = 0; i < 10 && current; i++) {
    const c: Lean | null = await Category.findById(current).select("parentId").lean<Lean>();
    const parent: string | null = c?.parentId ? c.parentId.toString() : null;
    if (parent === ancestorId) return true;
    current = parent;
  }
  return false;
}

/** Soft-deletes a category. Its sub-categories move up one level; products simply lose the link. */
export async function deleteCategory(id: string) {
  await connectMongoose();
  const cat = await Category.findById(id);
  if (!cat) throw new CatalogError("Category not found.");
  const before = toRow(cat.toObject() as Lean);
  await Category.updateMany({ parentId: cat._id }, { parentId: cat.parentId ?? null });
  await Product.updateMany(trustFilter({ categoryIds: cat._id }), { $pull: { categoryIds: cat._id } }).setOptions({
    withDeleted: true,
  });
  await (cat as unknown as { softDelete(): Promise<unknown> }).softDelete();
  return before;
}

/** Errors with a message that is safe to show to the admin user. */
export class CatalogError extends Error {}
