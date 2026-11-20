import "server-only";
import mongoose from "mongoose";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { CatalogError } from "./categories";
import { rulesToFilter, slugify, uniqueSlug, type CollectionRule } from "./logic";
import { Collection, Product } from "./models";
import type { CollectionInput } from "./schemas";

/** Collections (FR-AD-03): manual (hand-picked, ordered) or rule-based (e.g. "price under ৳500"). */

export type CollectionRow = {
  id: string;
  name: { en: string; bn: string };
  slug: string;
  description: { en: string; bn: string };
  image: { url: string; alt: string };
  type: "manual" | "rule";
  match: "all" | "any";
  rules: CollectionRule[];
  productIds: string[];
  sort: "manual" | "newest" | "price_asc" | "price_desc" | "bestselling";
  listingMode: "pagination" | "infinite";
  active: boolean;
  seo: { title: string; description: string; ogImage: string };
};

type Lean = Omit<CollectionRow, "id" | "productIds"> & {
  _id: { toString(): string };
  productIds?: { toString(): string }[];
};

function toRow(c: Lean): CollectionRow {
  return {
    id: c._id.toString(),
    name: { en: c.name.en, bn: c.name.bn ?? "" },
    slug: c.slug,
    description: { en: c.description?.en ?? "", bn: c.description?.bn ?? "" },
    image: { url: c.image?.url ?? "", alt: c.image?.alt ?? "" },
    type: c.type,
    match: c.match ?? "all",
    rules: (c.rules ?? []) as CollectionRule[],
    productIds: (c.productIds ?? []).map((p) => p.toString()),
    sort: c.sort ?? "newest",
    listingMode: c.listingMode ?? "pagination",
    active: c.active ?? true,
    seo: { title: c.seo?.title ?? "", description: c.seo?.description ?? "", ogImage: c.seo?.ogImage ?? "" },
  };
}

export async function listCollections(): Promise<(CollectionRow & { productCount: number })[]> {
  await connectMongoose();
  const rows = (await Collection.find().sort({ "name.en": 1 }).lean<Lean[]>()).map(toRow);
  return Promise.all(rows.map(async (r) => ({ ...r, productCount: await countCollectionProducts(r) })));
}

export async function getCollection(id: string): Promise<CollectionRow | null> {
  await connectMongoose();
  const c = await Collection.findById(id).lean<Lean>();
  return c ? toRow(c) : null;
}

async function slugTaken(slug: string, exceptId?: string) {
  const found = await Collection.findOne({ slug }).setOptions({ withDeleted: true }).select("_id").lean<Lean>();
  return !!found && found._id.toString() !== exceptId;
}

export async function saveCollection(id: string | null, input: CollectionInput) {
  await connectMongoose();
  const before = id ? await getCollection(id) : null;
  if (id && !before) throw new CatalogError("Collection not found.");
  if (input.slug && (await slugTaken(input.slug, id ?? undefined)))
    throw new CatalogError("That URL slug is already used.");
  const slug = input.slug || (await uniqueSlug(slugify(input.name.en), (s) => slugTaken(s, id ?? undefined)));

  const doc = { ...input, slug, productIds: input.type === "manual" ? input.productIds : [] };
  const saved = id
    ? await Collection.findByIdAndUpdate(id, doc, { new: true, runValidators: true }).lean<Lean>()
    : ((await Collection.create(doc)).toObject() as Lean);
  if (!saved) throw new CatalogError("Collection not found.");
  return { before, after: toRow(saved) };
}

export async function deleteCollection(id: string) {
  await connectMongoose();
  const c = await Collection.findById(id);
  if (!c) throw new CatalogError("Collection not found.");
  const before = toRow(c.toObject() as Lean);
  await (c as unknown as { softDelete(): Promise<unknown> }).softDelete();
  return before;
}

/** MongoDB filter for the products in a collection (active products only unless `includeHidden`). */
export function collectionFilter(
  c: Pick<CollectionRow, "type" | "rules" | "match" | "productIds">,
  includeHidden = false,
) {
  const base: Record<string, unknown> = includeHidden ? {} : { status: "active" };
  if (c.type === "manual") {
    return trustFilter({ ...base, _id: { $in: c.productIds.map((id) => new mongoose.Types.ObjectId(id)) } });
  }
  const rules = c.rules.map((r) =>
    r.field === "category" ? { ...r, value: r.value.map((id) => new mongoose.Types.ObjectId(id)) } : r,
  ) as unknown as CollectionRule[];
  const ruleFilter = rulesToFilter(rules, c.match);
  if (!ruleFilter) return null;
  return trustFilter({
    ...base,
    ...("$and" in ruleFilter || "$or" in ruleFilter ? { $and: [ruleFilter] } : ruleFilter),
  });
}

export async function countCollectionProducts(c: CollectionRow): Promise<number> {
  const filter = collectionFilter(c, true);
  return filter ? Product.countDocuments(filter) : 0;
}
