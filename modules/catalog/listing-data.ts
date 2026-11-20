import "server-only";
import mongoose from "mongoose";
import { cacheLife, cacheTag } from "next/cache";
import { connectMongoose } from "@/lib/db/mongo";
import { TAGS } from "./cache-tags";
import { collectionFilter, type CollectionRow } from "./collections";
import {
  decodeCursor,
  encodeCursor,
  filterConditions,
  keysetMatch,
  LISTING_SORTS,
  PAGE_SIZE,
  SORT_KEYS,
  type ListingQuery,
  type ListingSort,
} from "./listing";
import {
  getCategoryTree,
  i18n,
  seoOf,
  withDescendants,
  type I18n,
  type ListingMode,
  type TreeNode,
} from "./category-tree";
import { Collection, Product } from "./models";
import { searchProductIds } from "./search-data";
import { CARD_FIELDS, toCardProduct, type CardProduct } from "./storefront";

/**
 * Category and collection pages (FR-SF-07): page headers, filter options and the product list.
 * Public data for Active products only, cached and tagged like the rest of the storefront.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;
const { ObjectId } = mongoose.Types;

/** For search, `slug` holds the cleaned-up search words. */
export type ListingSource = { kind: "category" | "collection" | "search"; slug: string };
export type { ListingMode };

export type CategoryPageData = {
  id: string;
  slug: string;
  name: I18n;
  description: I18n;
  image: { url: string; alt: string };
  seo: { title: string; description: string; ogImage: string };
  listingMode: ListingMode;
  /** Parent categories, top level first. */
  trail: { name: string; slug: string }[];
  /** Visible sub-categories, for the links under the title. */
  children: { name: string; slug: string; image: string }[];
};

export async function getCategoryPage(slug: string): Promise<CategoryPageData | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog, TAGS.navigation, TAGS.category(slug));
  const tree = await getCategoryTree();
  const node = tree.find((c) => c.slug === slug);
  if (!node || !node.active) return null;
  const trail: { name: string; slug: string }[] = [];
  for (let p = tree.find((c) => c.id === node.parentId); p && trail.length < 10;) {
    if (p.active) trail.unshift({ name: p.name.en, slug: p.slug });
    const parentId = p.parentId;
    p = tree.find((c) => c.id === parentId);
  }
  return {
    id: node.id,
    slug: node.slug,
    name: node.name,
    description: node.description,
    image: node.image,
    seo: node.seo,
    listingMode: node.listingMode,
    trail,
    children: tree
      .filter((c) => c.parentId === node.id && c.active)
      .map((c) => ({ name: c.name.en, slug: c.slug, image: c.image.url })),
  };
}

// ---------- Collections ----------

const COLLECTION_SORT: Record<CollectionRow["sort"], ListingSort> = {
  manual: "featured",
  newest: "newest",
  bestselling: "bestselling",
  price_asc: "price-asc",
  price_desc: "price-desc",
};

export type CollectionPageData = {
  id: string;
  slug: string;
  name: I18n;
  description: I18n;
  image: { url: string; alt: string };
  seo: { title: string; description: string; ogImage: string };
  listingMode: ListingMode;
  defaultSort: ListingSort;
  /** Hand-picked collections can be shown in the admin's order ("Featured"). */
  manual: boolean;
};

async function getCollectionDoc(slug: string): Promise<AnyDoc | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog, TAGS.collection(slug));
  await connectMongoose();
  const c = await Collection.findOne({ slug, active: true }).lean<AnyDoc>();
  if (!c) return null;
  // Plain values only, so the result can be cached.
  return {
    _id: String(c._id),
    slug: String(c.slug),
    name: i18n(c.name),
    description: i18n(c.description),
    image: { url: String(c.image?.url ?? ""), alt: String(c.image?.alt ?? "") },
    seo: seoOf(c.seo),
    type: c.type === "rule" ? "rule" : "manual",
    match: c.match === "any" ? "any" : "all",
    rules: JSON.parse(JSON.stringify(c.rules ?? [])),
    productIds: ((c.productIds ?? []) as unknown[]).map(String),
    sort: String(c.sort ?? "newest"),
    listingMode: c.listingMode === "infinite" ? "infinite" : "pagination",
  };
}

export async function getCollectionPage(slug: string): Promise<CollectionPageData | null> {
  const c = await getCollectionDoc(slug);
  if (!c) return null;
  const manual = c.type === "manual";
  const sort = (c.sort ?? "newest") as CollectionRow["sort"];
  return {
    id: String(c._id),
    slug: String(c.slug),
    name: i18n(c.name),
    description: i18n(c.description),
    image: { url: String(c.image?.url ?? ""), alt: String(c.image?.alt ?? "") },
    seo: seoOf(c.seo),
    listingMode: c.listingMode === "infinite" ? "infinite" : "pagination",
    defaultSort: sort === "manual" && !manual ? "newest" : COLLECTION_SORT[sort],
    manual,
  };
}

/** Slugs to prebuild at deploy time. */
export async function getListingSlugs(kind: ListingSource["kind"]): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog, TAGS.navigation);
  await connectMongoose();
  if (kind === "category") return (await getCategoryTree()).filter((c) => c.active).map((c) => c.slug);
  const docs = await Collection.find({ active: true }).select("slug").lean<AnyDoc[]>();
  return docs.map((d) => String(d.slug));
}

// ---------- Products ----------

type Resolved = {
  base: Record<string, unknown>;
  defaultSort: ListingSort;
  /** Hand-picked order (manual collections) or best-match order (search). */
  positions: mongoose.Types.ObjectId[] | null;
  /** Which sort uses `positions`. */
  ordered: "featured" | "relevance" | null;
  tree: TreeNode[];
  /** Category page: the direct sub-categories offered as a filter. */
  childOptions: TreeNode[] | null;
};

async function resolve(source: ListingSource): Promise<Resolved | null> {
  const tree = await getCategoryTree();
  if (source.kind === "category") {
    const page = await getCategoryPage(source.slug);
    if (!page) return null;
    return {
      base: { categoryIds: { $in: withDescendants(tree, page.id).map((id) => new ObjectId(id)) } },
      defaultSort: "newest",
      positions: null,
      ordered: null,
      tree,
      childOptions: tree.filter((c) => c.parentId === page.id && c.active),
    };
  }
  if (source.kind === "search") {
    const ids = (await searchProductIds(source.slug)).map((id) => new ObjectId(id));
    return {
      base: { _id: { $in: ids } },
      defaultSort: "relevance",
      positions: ids,
      ordered: "relevance",
      tree,
      childOptions: null,
    };
  }
  const c = await getCollectionDoc(source.slug);
  const page = await getCollectionPage(source.slug);
  if (!c || !page) return null;
  const filter = collectionFilter(
    { type: c.type, rules: c.rules, match: c.match ?? "all", productIds: c.productIds },
    true,
  );
  return {
    base: filter ?? { _id: { $in: [] } },
    defaultSort: page.defaultSort,
    positions: page.manual ? (c.productIds as string[]).map((id) => new ObjectId(id)) : null,
    ordered: page.manual ? "featured" : null,
    tree,
    childOptions: null,
  };
}

const LIVE = { status: "active", deletedAt: null };

function sourceTags(source: ListingSource): string[] {
  if (source.kind === "category") return [TAGS.catalog, TAGS.category(source.slug)];
  if (source.kind === "collection") return [TAGS.catalog, TAGS.collection(source.slug)];
  return [TAGS.catalog];
}

function sortFor(r: Resolved, q: ListingQuery): ListingSort {
  if (!q.sort) return r.defaultSort;
  if ((q.sort === "featured" || q.sort === "relevance") && q.sort !== r.ordered) return r.defaultSort;
  return q.sort;
}

function matchFor(r: Resolved, q: ListingQuery) {
  const catIds = q.cats.flatMap((slug) => {
    const node = r.tree.find((c) => c.slug === slug);
    return node ? withDescendants(r.tree, node.id) : [];
  });
  const conditions = filterConditions(
    q,
    [...new Set(catIds)].map((id) => new ObjectId(id)),
  );
  return { $and: [LIVE, r.base, ...conditions] };
}

export type ListingResult = {
  products: CardProduct[];
  /** Matching products in total (first load only; "load more" requests leave it at -1). */
  total: number;
  page: number;
  pages: number;
  sort: ListingSort;
  /** Pass back to load the next batch; null at the end of the list. */
  nextCursor: string | null;
};

const EMPTY_RESULT: ListingResult = { products: [], total: 0, page: 1, pages: 1, sort: "newest", nextCursor: null };

/**
 * One page of products. Numbered pages skip ahead (capped at MAX_PAGE); "load more" continues from a
 * cursor instead, so deep scrolling never makes the database skip over rows (SRS §9).
 */
export async function getListing(
  source: ListingSource,
  query: ListingQuery,
  cursor: string | null = null,
): Promise<ListingResult> {
  "use cache";
  cacheLife("hours");
  cacheTag(...sourceTags(source));
  await connectMongoose();
  const r = await resolve(source);
  if (!r) return EMPTY_RESULT;

  const sort = sortFor(r, query);
  const keys = SORT_KEYS[sort];
  const match = matchFor(r, query);
  const after = cursor ? decodeCursor(cursor, sort) : null;
  if (cursor && !after) return { ...EMPTY_RESULT, sort, total: -1 };

  const project = Object.fromEntries([...CARD_FIELDS.split(" "), ...keys.map(([f]) => f)].map((f) => [f, 1]));
  const pipeline: mongoose.PipelineStage[] = [
    { $match: match },
    {
      $addFields: {
        _pub: { $ifNull: ["$publishedAt", "$createdAt"] },
        ...(r.positions ? { _pos: { $indexOfArray: [r.positions, "$_id"] } } : {}),
      },
    },
  ];
  if (after) {
    const typed = after.map((v, i) => {
      const field = keys[i]![0];
      return field === "_id" ? new ObjectId(String(v)) : field === "_pub" ? new Date(String(v)) : v;
    });
    pipeline.push({ $match: keysetMatch(keys, typed) });
  }
  pipeline.push({ $sort: Object.fromEntries(keys) as Record<string, 1 | -1> });
  if (!after && query.page > 1) pipeline.push({ $skip: (query.page - 1) * PAGE_SIZE });
  pipeline.push({ $limit: PAGE_SIZE + 1 }, { $project: project });

  const [docs, counted] = await Promise.all([
    Product.aggregate<AnyDoc>(pipeline),
    after ? Promise.resolve(null) : Product.aggregate<{ n: number }>([{ $match: match }, { $count: "n" }]),
  ]);

  const more = docs.length > PAGE_SIZE;
  const shown = docs.slice(0, PAGE_SIZE);
  const last = shown[shown.length - 1];
  const nextCursor =
    more && last
      ? encodeCursor(
          keys.map(([f]) => {
            const v = last[f];
            return f === "_id" ? String(v) : f === "_pub" ? new Date(v).toISOString() : Number(v ?? 0);
          }),
        )
      : null;
  const total = counted ? (counted[0]?.n ?? 0) : -1;
  return {
    products: shown.map(toCardProduct),
    total,
    page: after ? 0 : query.page,
    pages: total >= 0 ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 0,
    sort,
    nextCursor,
  };
}

// ---------- Filter options ----------

export type ListingFacets = {
  total: number;
  /** Cheapest and dearest product in the set (poisha), for the price inputs' hints. */
  price: { min: number; max: number };
  colours: { value: string; count: number }[];
  cats: { slug: string; name: string; count: number }[];
  hasRatings: boolean;
  inStock: number;
  sorts: ListingSort[];
  defaultSort: ListingSort;
};

/** What the filter panel offers for this page (counts are for the whole page, before filtering). */
export async function getListingFacets(source: ListingSource): Promise<ListingFacets | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(...sourceTags(source));
  await connectMongoose();
  const r = await resolve(source);
  if (!r) return null;
  const match = { $and: [LIVE, r.base] };

  const [agg] = await Product.aggregate<AnyDoc>([
    { $match: match },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              min: { $min: "$priceMin" },
              max: { $max: "$priceMin" },
              rated: { $sum: { $cond: [{ $gt: ["$ratingCount", 0] }, 1, 0] } },
              inStock: { $sum: { $cond: ["$inStock", 1, 0] } },
            },
          },
        ],
        colours: [
          { $unwind: "$colours" },
          { $group: { _id: "$colours", n: { $sum: 1 } } },
          { $sort: { n: -1, _id: 1 } },
          { $limit: 24 },
        ],
        cats: [{ $unwind: "$categoryIds" }, { $group: { _id: "$categoryIds" } }],
      },
    },
  ]);
  const s = agg?.summary?.[0] ?? {};

  // Category options: sub-categories on a category page; top-level categories on a collection page.
  let options: TreeNode[];
  if (r.childOptions) {
    options = r.childOptions;
  } else {
    const present = new Set(((agg?.cats ?? []) as AnyDoc[]).map((c) => String(c._id)));
    const roots = new Set<string>();
    for (const id of present) {
      let node = r.tree.find((c) => c.id === id);
      for (let i = 0; node?.parentId && i < 10; i++) node = r.tree.find((c) => c.id === node!.parentId);
      if (node?.active) roots.add(node.id);
    }
    options = r.tree.filter((c) => roots.has(c.id));
  }
  let cats: ListingFacets["cats"] = [];
  if (options.length > 1) {
    const branches = Object.fromEntries(
      options
        .slice(0, 20)
        .map((o, i) => [
          `c${i}`,
          [
            { $match: { categoryIds: { $in: withDescendants(r.tree, o.id).map((id) => new ObjectId(id)) } } },
            { $count: "n" },
          ],
        ]),
    );
    const [counts] = await Product.aggregate<AnyDoc>([{ $match: match }, { $facet: branches }]);
    cats = options
      .slice(0, 20)
      .map((o, i) => ({ slug: o.slug, name: o.name.en, count: Number(counts?.[`c${i}`]?.[0]?.n ?? 0) }))
      .filter((c) => c.count > 0);
    if (cats.length < 2) cats = []; // one choice isn't a filter
  }

  return {
    total: Number(s.total ?? 0),
    price: { min: Number(s.min ?? 0), max: Number(s.max ?? 0) },
    colours: ((agg?.colours ?? []) as AnyDoc[]).map((c) => ({ value: String(c._id), count: Number(c.n) })),
    cats,
    hasRatings: Number(s.rated ?? 0) > 0,
    inStock: Number(s.inStock ?? 0),
    sorts: LISTING_SORTS.filter((x) => (x !== "featured" && x !== "relevance") || x === r.ordered),
    defaultSort: r.defaultSort,
  };
}
