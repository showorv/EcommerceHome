import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connectMongoose } from "@/lib/db/mongo";
import { TAGS } from "./cache-tags";
import { discountPercent, stockBadge } from "./logic";
import { blurPlaceholderUrl, videoPosterUrl } from "./media-url";
import { Category, Product, Variant } from "./models";
import { youtubeId } from "./schemas";
import type { PickVariant } from "./variant-picker";

/**
 * Storefront reads. Everything here is public data for Active products only, cached with
 * `"use cache"` and tagged so an admin save shows up on the next visit (NFR-SC-02).
 * Never return cost prices or anything else staff-only from this file.
 */

export type CardMedia = {
  type: "image" | "video";
  url: string;
  alt: string;
  width: number;
  height: number;
  focalX: number;
  focalY: number;
  poster: string;
  blur: string;
  autoplay: boolean;
};

export type CardProduct = {
  id: string;
  slug: string;
  title: { en: string; bn: string };
  labels: string[];
  price: number;
  priceMax: number;
  compareAt: number; // 0 = no struck-through price
  discount: number; // % off for the shown price
  maxDiscount: number; // biggest % off across variants ("Up to …")
  stock: ReturnType<typeof stockBadge>;
  inStock: boolean;
  ratingAvg: number;
  ratingCount: number;
  variantCount: number;
  /** Primary first, then the admin-chosen hover media, then the rest (max 5, images/videos only). */
  media: CardMedia[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mongoose lean docs are mapped field by field
type AnyDoc = Record<string, any>;

export const CARD_FIELDS =
  "title slug labels media hoverMediaIndex lowStockAt ratingAvg ratingCount priceMin priceMax compareAtFrom maxDiscount totalStock inStock variantCount";

function toCardMedia(m: AnyDoc): CardMedia | null {
  if (m.type !== "image" && m.type !== "video") return null; // YouTube / 3D are shown on the product page only
  const url = String(m.url ?? "");
  if (!url) return null;
  return {
    type: m.type,
    url,
    alt: String(m.alt ?? ""),
    width: Number(m.width ?? 0),
    height: Number(m.height ?? 0),
    focalX: Number(m.focalX ?? 50),
    focalY: Number(m.focalY ?? 50),
    poster: String(m.poster || (m.type === "video" ? videoPosterUrl(url) : "")),
    blur: blurPlaceholderUrl(url),
    autoplay: m.type === "video" && Boolean(m.autoplayOnHover),
  };
}

/** Pure mapping from a product document to what a card needs (exported for tests). */
export function toCardProduct(p: AnyDoc): CardProduct {
  const all = ((p.media ?? []) as AnyDoc[]).map(toCardMedia).filter((m): m is CardMedia => m !== null);
  // A video can't be the still first image; use the first image as primary when there is one.
  const primaryIdx = Math.max(
    0,
    all.findIndex((m) => m.type === "image"),
  );
  const rawMedia = (p.media ?? []) as AnyDoc[];
  const hoverDoc = rawMedia[Number(p.hoverMediaIndex ?? 1)];
  const hoverIdx = hoverDoc ? all.findIndex((m) => m.url === String(hoverDoc.url)) : -1;
  const ordered: CardMedia[] = [];
  const push = (i: number) => {
    const m = all[i];
    if (m && !ordered.includes(m)) ordered.push(m);
  };
  push(primaryIdx);
  if (hoverIdx >= 0) push(hoverIdx);
  all.forEach((_, i) => push(i));

  const price = Number(p.priceMin ?? 0);
  const compareAtFrom = Number(p.compareAtFrom ?? 0);
  const discount = discountPercent(price, compareAtFrom);
  const available = Number(p.totalStock ?? 0);
  return {
    id: String(p._id),
    slug: String(p.slug),
    title: { en: String(p.title?.en ?? ""), bn: String(p.title?.bn ?? "") },
    labels: ((p.labels ?? []) as string[]).map(String),
    price,
    priceMax: Number(p.priceMax ?? price),
    compareAt: discount > 0 ? compareAtFrom : 0,
    discount,
    maxDiscount: Number(p.maxDiscount ?? discount),
    stock: stockBadge(available, Number(p.lowStockAt ?? 5)),
    inStock: Boolean(p.inStock),
    ratingAvg: Number(p.ratingAvg ?? 0),
    ratingCount: Number(p.ratingCount ?? 0),
    variantCount: Number(p.variantCount ?? 0),
    media: ordered.slice(0, 5),
  };
}

export type CardSort = "newest" | "bestselling" | "price-asc" | "price-desc" | "discount";

const SORTS: Record<CardSort, Record<string, 1 | -1>> = {
  newest: { publishedAt: -1, _id: -1 },
  bestselling: { sortScore: -1, publishedAt: -1, _id: -1 },
  "price-asc": { priceMin: 1, _id: -1 },
  "price-desc": { priceMin: -1, _id: -1 },
  discount: { maxDiscount: -1, _id: -1 },
};

/** Active products for a grid or carousel (home sections now; category pages extend this in 1.8). */
export async function getCardProducts({ sort = "newest", limit = 8 }: { sort?: CardSort; limit?: number } = {}) {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog, TAGS.productLists);
  await connectMongoose();
  const docs = await Product.find({ status: "active" })
    .select(CARD_FIELDS)
    .sort(SORTS[sort] ?? SORTS.newest)
    .limit(Math.min(Math.max(limit, 1), 48))
    .lean<AnyDoc[]>();
  return docs.map(toCardProduct);
}

// ---------- Product view (quick view now, product page in 1.7) ----------

export type ViewMedia = {
  id: string;
  type: "image" | "video" | "youtube";
  url: string;
  alt: string;
  poster: string;
  width: number;
  height: number;
  focalX: number;
  focalY: number;
  blur: string;
  youtubeId: string | null;
};

export type ProductView = {
  id: string;
  slug: string;
  title: { en: string; bn: string };
  shortDescription: { en: string; bn: string };
  labels: string[];
  optionNames: string[];
  lowStockAt: number;
  ratingAvg: number;
  ratingCount: number;
  media: ViewMedia[];
  variants: PickVariant[];
};

function toViewMedia(m: AnyDoc): ViewMedia | null {
  const type = m.type as string;
  if (type !== "image" && type !== "video" && type !== "youtube") return null;
  const url = String(m.url ?? "");
  const yt = type === "youtube" ? youtubeId(url) : null;
  if (!url || (type === "youtube" && !yt)) return null;
  return {
    id: String(m._id),
    type,
    url,
    alt: String(m.alt ?? ""),
    poster: String(m.poster || (type === "video" ? videoPosterUrl(url) : "")),
    width: Number(m.width ?? 0),
    height: Number(m.height ?? 0),
    focalX: Number(m.focalX ?? 50),
    focalY: Number(m.focalY ?? 50),
    blur: type === "youtube" ? "" : blurPlaceholderUrl(url),
    youtubeId: yt,
  };
}

function plainOptions(o: unknown): Record<string, string> {
  if (!o) return {};
  const entries = o instanceof Map ? [...o.entries()] : Object.entries(o as Record<string, unknown>);
  return Object.fromEntries(entries.map(([k, v]) => [String(k), String(v)]));
}

/**
 * Everything a shopper may see about one Active product, with its active variants.
 * Public data only: no cost price, SKU-level stock is reduced to "available" (stock − reserved).
 */
export async function getProductView(slug: string): Promise<ProductView | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog, TAGS.product(slug));
  await connectMongoose();
  const p = await Product.findOne({ slug, status: "active" })
    .select("title slug shortDescription labels optionNames lowStockAt ratingAvg ratingCount media")
    .lean<AnyDoc>();
  if (!p) return null;
  const variants = await Variant.find({ productId: p._id, active: true })
    .select("title options price compareAtPrice stock reserved mediaIds position")
    .sort({ position: 1 })
    .lean<AnyDoc[]>();
  const sd = (p.shortDescription ?? {}) as { en?: string; bn?: string };
  return {
    id: String(p._id),
    slug: String(p.slug),
    title: { en: String(p.title?.en ?? ""), bn: String(p.title?.bn ?? "") },
    shortDescription: { en: sd.en ?? "", bn: sd.bn ?? "" },
    labels: ((p.labels ?? []) as string[]).map(String),
    optionNames: ((p.optionNames ?? []) as string[]).map(String),
    lowStockAt: Number(p.lowStockAt ?? 5),
    ratingAvg: Number(p.ratingAvg ?? 0),
    ratingCount: Number(p.ratingCount ?? 0),
    media: ((p.media ?? []) as AnyDoc[]).map(toViewMedia).filter((m): m is ViewMedia => m !== null),
    variants: variants.map((v) => ({
      id: String(v._id),
      title: String(v.title ?? ""),
      options: plainOptions(v.options),
      price: Number(v.price ?? 0),
      compareAt: Number(v.compareAtPrice ?? 0),
      available: Math.max(0, Number(v.stock ?? 0) - Number(v.reserved ?? 0)),
      mediaIds: ((v.mediaIds ?? []) as string[]).map(String),
    })),
  };
}

// ---------- Product page (1.7) ----------

export type DetailBlock =
  | { id: string; type: "text"; heading: string; body: string }
  | { id: string; type: "image"; url: string; alt: string; caption: string }
  | { id: string; type: "video"; url: string; youtubeId: string | null; caption: string }
  | { id: string; type: "specs"; heading: string; rows: { label: string; value: string }[] }
  | { id: string; type: "inBox"; heading: string; items: string[] }
  | {
      id: string;
      type: "comparison";
      heading: string;
      columns: string[];
      rows: { label: string; values: string[] }[];
    };

export type ProductDetail = ProductView & {
  blocks: DetailBlock[];
  specs: { label: string; value: string }[];
  seo: { title: string; description: string; ogImage: string };
  category: { name: string; slug: string } | null;
};

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

function toBlock(b: AnyDoc): DetailBlock | null {
  const d = (b.data ?? {}) as AnyDoc;
  const id = String(b._id ?? "");
  switch (b.type) {
    case "text":
      return str(d.body) ? { id, type: "text", heading: str(d.heading), body: str(d.body) } : null;
    case "image":
      return str(d.url) ? { id, type: "image", url: str(d.url), alt: str(d.alt), caption: str(d.caption) } : null;
    case "video": {
      const url = str(d.url);
      return url ? { id, type: "video", url, youtubeId: youtubeId(url), caption: str(d.caption) } : null;
    }
    case "specs": {
      const rows = ((d.rows ?? []) as AnyDoc[]).map((r) => ({ label: str(r.label), value: str(r.value) }));
      return rows.length ? { id, type: "specs", heading: str(d.heading) || "Specifications", rows } : null;
    }
    case "inBox": {
      const items = ((d.items ?? []) as unknown[]).map(str).filter(Boolean);
      return items.length ? { id, type: "inBox", heading: str(d.heading) || "What's in the box", items } : null;
    }
    case "comparison": {
      const columns = ((d.columns ?? []) as unknown[]).map(str);
      const rows = ((d.rows ?? []) as AnyDoc[]).map((r) => ({
        label: str(r.label),
        values: ((r.values ?? []) as unknown[]).map(str),
      }));
      return columns.length >= 2 && rows.length
        ? { id, type: "comparison", heading: str(d.heading), columns, rows }
        : null;
    }
    default:
      return null;
  }
}

/** Everything the product page shows. Builds on getProductView so quick view and the page always agree. */
export async function getProductDetail(slug: string): Promise<ProductDetail | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog, TAGS.product(slug));
  const view = await getProductView(slug);
  if (!view) return null;
  await connectMongoose();
  const p = await Product.findOne({ slug, status: "active" }).select("blocks specs seo categoryIds").lean<AnyDoc>();
  if (!p) return null;
  const catId = ((p.categoryIds ?? []) as unknown[])[0];
  const cat = catId ? await Category.findOne({ _id: catId, active: true }).select("name slug").lean<AnyDoc>() : null;
  if (cat) cacheTag(TAGS.category(String(cat.slug)));
  return {
    ...view,
    blocks: ((p.blocks ?? []) as AnyDoc[]).map(toBlock).filter((b): b is DetailBlock => b !== null),
    specs: ((p.specs ?? []) as AnyDoc[])
      .map((r) => ({ label: str(r.label), value: str(r.value) }))
      .filter((r) => r.label || r.value),
    seo: { title: str(p.seo?.title), description: str(p.seo?.description), ogImage: str(p.seo?.ogImage) },
    category: cat ? { name: str(cat.name?.en), slug: str(cat.slug) } : null,
  };
}

/** Slugs to prebuild at deploy time (newest first). Other products are built on their first visit. */
export async function getPrebuildSlugs(limit = 200): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog, TAGS.productLists);
  await connectMongoose();
  const docs = await Product.find({ status: "active" })
    .select("slug")
    .sort({ publishedAt: -1 })
    .limit(limit)
    .lean<AnyDoc[]>();
  return docs.map((d) => String(d.slug));
}
