import "server-only";
import mongoose from "mongoose";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { CatalogError } from "./categories";
import { productColours, slugify, summariseVariants, uniqueSlug, variantTitle } from "./logic";
import { InventoryMovement, Product, Variant } from "./models";
import type { BlockInput, ProductInput } from "./schemas";

/** Products + variants (FR-AD-02, FR-PD-02, FR-PD-08). Callers check permissions and write the audit log. */

const { ObjectId } = mongoose.Types;

export type ProductStatus = "draft" | "active" | "archived";

export type ProductListRow = {
  id: string;
  title: string;
  slug: string;
  status: ProductStatus;
  image: string | null;
  priceMin: number;
  priceMax: number;
  totalStock: number;
  variantCount: number;
  lowStock: boolean;
  updatedAt: string;
};

export type MediaItem = {
  id: string;
  type: "image" | "video" | "youtube" | "model";
  url: string;
  alt: string;
  poster: string;
  width: number;
  height: number;
  focalX: number;
  focalY: number;
  autoplayOnHover: boolean;
};

export type VariantEdit = {
  id: string;
  sku: string;
  options: Record<string, string>;
  price: number;
  compareAtPrice: number;
  costPrice: number;
  weightGrams: number;
  stock: number;
  reserved: number;
  lowStockAt: number | null;
  mediaIds: string[];
  active: boolean;
};

export type ProductEdit = {
  id: string;
  title: { en: string; bn: string };
  slug: string;
  status: ProductStatus;
  categoryIds: string[];
  tags: string[];
  labels: string[];
  shortDescription: { en: string; bn: string };
  blocks: BlockInput[];
  specs: { label: string; value: string }[];
  media: MediaItem[];
  hoverMediaIndex: number;
  optionNames: string[];
  lowStockAt: number;
  seo: { title: string; description: string; ogImage: string };
  variants: VariantEdit[];
  updatedAt: string;
};

type AnyDoc = Record<string, unknown> & { _id: { toString(): string } };
const str = (v: unknown) => (v == null ? "" : String(v));

function mediaOf(p: AnyDoc): MediaItem[] {
  return ((p.media as AnyDoc[] | undefined) ?? []).map((m) => ({
    id: m._id.toString(),
    type: m.type as MediaItem["type"],
    url: str(m.url),
    alt: str(m.alt),
    poster: str(m.poster),
    width: Number(m.width ?? 0),
    height: Number(m.height ?? 0),
    focalX: Number(m.focalX ?? 50),
    focalY: Number(m.focalY ?? 50),
    autoplayOnHover: Boolean(m.autoplayOnHover),
  }));
}

function optionsOf(v: AnyDoc): Record<string, string> {
  const o = v.options as Map<string, string> | Record<string, string> | undefined;
  if (!o) return {};
  return o instanceof Map ? Object.fromEntries(o) : { ...o };
}

// ---------- Reading ----------

export async function listProductsAdmin(opts: { q?: string; status?: string; categoryId?: string; page?: number }) {
  await connectMongoose();
  const pageSize = 25;
  const page = Math.max(1, opts.page ?? 1);
  const filter: Record<string, unknown> = {};
  if (opts.status && ["draft", "active", "archived"].includes(opts.status)) filter.status = opts.status;
  if (opts.categoryId && /^[a-f0-9]{24}$/i.test(opts.categoryId)) filter.categoryIds = new ObjectId(opts.categoryId);
  if (opts.q?.trim()) {
    const rx = new RegExp(
      opts.q
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .slice(0, 60),
      "i",
    );
    const skuHits = await Variant.find(trustFilter({ sku: { $regex: rx } }))
      .select("productId")
      .limit(50)
      .lean<AnyDoc[]>();
    filter.$or = [
      { "title.en": { $regex: rx } },
      { "title.bn": { $regex: rx } },
      { slug: { $regex: rx } },
      { _id: { $in: skuHits.map((v) => v.productId) } },
    ];
  }
  const f = trustFilter(filter);
  const [docs, total] = await Promise.all([
    Product.find(f)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select("title slug status media priceMin priceMax totalStock variantCount lowStockAt updatedAt")
      .lean<AnyDoc[]>(),
    Product.countDocuments(f),
  ]);
  const rows: ProductListRow[] = docs.map((p) => {
    const firstImage = mediaOf(p).find((m) => m.type === "image");
    return {
      id: p._id.toString(),
      title: (p.title as { en: string }).en,
      slug: str(p.slug),
      status: p.status as ProductStatus,
      image: firstImage?.url ?? null,
      priceMin: Number(p.priceMin ?? 0),
      priceMax: Number(p.priceMax ?? 0),
      totalStock: Number(p.totalStock ?? 0),
      variantCount: Number(p.variantCount ?? 0),
      lowStock: Number(p.totalStock ?? 0) <= Number(p.lowStockAt ?? 5),
      updatedAt: new Date(p.updatedAt as Date).toISOString(),
    };
  });
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getProductForEdit(id: string): Promise<ProductEdit | null> {
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  await connectMongoose();
  const p = await Product.findById(id).lean<AnyDoc>();
  if (!p) return null;
  const variants = await Variant.find({ productId: p._id }).sort({ position: 1 }).lean<AnyDoc[]>();
  const t = p.title as { en: string; bn?: string };
  const sd = (p.shortDescription as { en?: string; bn?: string }) ?? {};
  const seo = (p.seo as { title?: string; description?: string; ogImage?: string }) ?? {};
  return {
    id: p._id.toString(),
    title: { en: t.en, bn: t.bn ?? "" },
    slug: str(p.slug),
    status: p.status as ProductStatus,
    categoryIds: ((p.categoryIds as unknown[]) ?? []).map(String),
    tags: (p.tags as string[]) ?? [],
    labels: (p.labels as string[]) ?? [],
    shortDescription: { en: sd.en ?? "", bn: sd.bn ?? "" },
    blocks: ((p.blocks as AnyDoc[]) ?? []).map((b) => ({ type: b.type, data: b.data }) as BlockInput),
    specs: ((p.specs as { label: string; value: string }[]) ?? []).map((s) => ({ label: s.label, value: s.value })),
    media: mediaOf(p),
    hoverMediaIndex: Number(p.hoverMediaIndex ?? 1),
    optionNames: (p.optionNames as string[]) ?? [],
    lowStockAt: Number(p.lowStockAt ?? 5),
    seo: { title: seo.title ?? "", description: seo.description ?? "", ogImage: seo.ogImage ?? "" },
    variants: variants.map((v) => ({
      id: v._id.toString(),
      sku: str(v.sku),
      options: optionsOf(v),
      price: Number(v.price),
      compareAtPrice: Number(v.compareAtPrice ?? 0),
      costPrice: Number(v.costPrice ?? 0),
      weightGrams: Number(v.weightGrams ?? 0),
      stock: Number(v.stock ?? 0),
      reserved: Number(v.reserved ?? 0),
      lowStockAt: v.lowStockAt == null ? null : Number(v.lowStockAt),
      mediaIds: (v.mediaIds as string[]) ?? [],
      active: v.active !== false,
    })),
    updatedAt: new Date(p.updatedAt as Date).toISOString(),
  };
}

// ---------- Writing ----------

async function productSlugTaken(slug: string, exceptId?: string) {
  const found = await Product.findOne({ slug }).setOptions({ withDeleted: true }).select("_id").lean<AnyDoc>();
  return !!found && found._id.toString() !== exceptId;
}

async function skuOwner(sku: string): Promise<string | null> {
  const v = await Variant.findOne({ sku }).select("productId").lean<AnyDoc>();
  return v ? String(v.productId) : null;
}

/**
 * Creates or updates a product and its variants in one transaction.
 * - Variants missing from the input are deleted if they never moved stock, otherwise deactivated.
 * - New variants with an opening stock get a "purchase" movement so history adds up.
 * - Existing variants' stock is NOT changed here; that goes through inventory adjustments.
 */
export async function saveProduct(id: string | null, input: ProductInput, actorId: string) {
  await connectMongoose();
  const before = id ? await getProductForEdit(id) : null;
  if (id && !before) throw new CatalogError("Product not found.");

  if (input.slug && (await productSlugTaken(input.slug, id ?? undefined)))
    throw new CatalogError("That URL slug is already used by another product.");
  const slug = input.slug || (await uniqueSlug(slugify(input.title.en), (s) => productSlugTaken(s, id ?? undefined)));

  for (const v of input.variants) {
    const owner = await skuOwner(v.sku);
    if (owner && owner !== id) throw new CatalogError(`SKU ${v.sku} is already used by another product.`);
  }

  const productId = id ? new ObjectId(id) : new ObjectId();
  // Keep existing media ids so variant → media links survive edits.
  // New media arrive with a temporary id from the browser (e.g. "tmp-…"); variants may refer to it.
  const media = input.media.map(({ id: mediaId, ...m }) => ({
    ...m,
    _id: mediaId && /^[a-f0-9]{24}$/i.test(mediaId) ? new ObjectId(mediaId) : new ObjectId(),
  }));
  const mediaIdMap = new Map(input.media.map((m, i) => [m.id ?? `new-${i}`, media[i]!._id.toString()]));

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const existing = await Variant.find({ productId }).session(session).lean<AnyDoc[]>();
      const keepIds = new Set(input.variants.map((v) => v.id).filter(Boolean));

      for (const old of existing) {
        if (keepIds.has(old._id.toString())) continue;
        const moved = await InventoryMovement.exists({ variantId: old._id }).session(session);
        if (moved || Number(old.reserved) > 0)
          await Variant.updateOne({ _id: old._id }, { active: false }, { session });
        else await Variant.deleteOne({ _id: old._id }, { session });
      }

      for (const [position, v] of input.variants.entries()) {
        const base = {
          productId,
          sku: v.sku,
          options: v.options,
          title: variantTitle(v.options, input.optionNames),
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          weightGrams: v.weightGrams,
          lowStockAt: v.lowStockAt === "" ? null : v.lowStockAt,
          mediaIds: v.mediaIds.map((m) => mediaIdMap.get(m) ?? m),
          position,
          active: v.active,
        };
        if (v.id) {
          const res = await Variant.updateOne({ _id: v.id, productId }, base, { session, runValidators: true });
          if (res.matchedCount === 0)
            throw new CatalogError("A variant was changed by someone else. Reload and try again.");
        } else {
          const [created] = await Variant.create([{ ...base, stock: v.initialStock, costPrice: v.initialCost }], {
            session,
          });
          if (v.initialStock > 0) {
            await InventoryMovement.create(
              [
                {
                  variantId: created._id,
                  productId,
                  change: v.initialStock,
                  stockAfter: v.initialStock,
                  reason: "purchase",
                  note: "Opening stock",
                  costPerUnit: v.initialCost || null,
                  byUserId: actorId,
                },
              ],
              { session },
            );
          }
        }
      }

      const variants = await Variant.find({ productId }).session(session).lean<AnyDoc[]>();
      const summary = listingFields(variants);
      const wasPublished = before?.status === "active";
      const doc = {
        title: input.title,
        slug,
        status: input.status,
        categoryIds: input.categoryIds.map((c) => new ObjectId(c)),
        tags: [...new Set(input.tags.map((t) => t.toLowerCase()))],
        labels: input.labels,
        shortDescription: input.shortDescription,
        blocks: input.blocks,
        specs: input.specs,
        media,
        hoverMediaIndex: Math.min(input.hoverMediaIndex, Math.max(0, media.length - 1)),
        optionNames: input.optionNames,
        lowStockAt: input.lowStockAt,
        seo: input.seo,
        ...summary,
        ...(input.status === "active" && !wasPublished ? { publishedAt: new Date() } : {}),
      };
      if (id) await Product.updateOne({ _id: productId }, doc, { session, runValidators: true });
      else await Product.create([{ _id: productId, ...doc }], { session });
    });
  } finally {
    await session.endSession();
  }

  const after = await getProductForEdit(productId.toString());
  if (!after) throw new CatalogError("Product could not be saved.");
  return { before, after };
}

/** Recomputes price range / stock flags on the product from its variants (after stock changes). */
/** Product-level listing fields (price range, discount, stock, colours) from its variant documents. */
function listingFields(variants: AnyDoc[]) {
  const summary = summariseVariants(
    variants.map((v) => ({
      price: Number(v.price),
      compareAtPrice: Number(v.compareAtPrice ?? 0),
      stock: Number(v.stock ?? 0),
      reserved: Number(v.reserved ?? 0),
      active: v.active !== false,
    })),
  );
  const colours = productColours(
    variants.map((v) => {
      const o = (v.options instanceof Map ? Object.fromEntries(v.options) : v.options) ?? {};
      return {
        options: Object.fromEntries(Object.entries(o as Record<string, unknown>).map(([k, val]) => [k, String(val)])),
        active: v.active !== false,
      };
    }),
  );
  return { ...summary, colours };
}

export async function syncProductFromVariants(
  productId: string | mongoose.Types.ObjectId,
  session?: mongoose.ClientSession,
) {
  const pid = typeof productId === "string" ? new ObjectId(productId) : productId;
  const q = Variant.find({ productId: pid });
  if (session) q.session(session);
  const variants = await q.lean<AnyDoc[]>();
  await Product.updateOne({ _id: pid }, listingFields(variants), { session }).setOptions({ withDeleted: true });
  const p = await Product.findById(pid).setOptions({ withDeleted: true }).select("slug").lean<AnyDoc>();
  return p ? str(p.slug) : null;
}

/** Copies a product as a draft with new slug and SKUs and zero stock. */
export async function duplicateProduct(id: string, actorId: string) {
  const src = await getProductForEdit(id);
  if (!src) throw new CatalogError("Product not found.");
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  const input: ProductInput = {
    title: { en: `${src.title.en} (copy)`, bn: src.title.bn ? `${src.title.bn} (কপি)` : "" },
    slug: "",
    status: "draft",
    categoryIds: src.categoryIds,
    tags: src.tags,
    labels: src.labels as ProductInput["labels"],
    shortDescription: src.shortDescription,
    blocks: src.blocks,
    specs: src.specs,
    media: src.media.map((m) => ({ ...m, id: undefined })),
    hoverMediaIndex: src.hoverMediaIndex,
    optionNames: src.optionNames,
    lowStockAt: src.lowStockAt,
    seo: { title: "", description: "", ogImage: src.seo.ogImage },
    variants: src.variants
      .filter((v) => v.active)
      .map((v) => ({
        id: "",
        sku: `${v.sku}-${suffix}`.slice(0, 40),
        options: v.options,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        weightGrams: v.weightGrams,
        lowStockAt: v.lowStockAt,
        mediaIds: [],
        active: true,
        initialStock: 0,
        initialCost: 0,
      })),
  };
  if (input.variants.length === 0) throw new CatalogError("This product has no active variants to copy.");
  return saveProduct(null, input, actorId);
}

export async function setProductStatus(id: string, status: ProductStatus) {
  await connectMongoose();
  const p = await Product.findById(id).select("status slug media").lean<AnyDoc>();
  if (!p) throw new CatalogError("Product not found.");
  if (status === "active" && !mediaOf(p).some((m) => m.type === "image"))
    throw new CatalogError("Add at least one image before making the product active.");
  await Product.updateOne(
    { _id: p._id },
    { status, ...(status === "active" && p.status !== "active" ? { publishedAt: new Date() } : {}) },
  );
  return { before: p.status as ProductStatus, slug: str(p.slug) };
}

/** Soft delete (restorable). Variants stay so order history keeps working. */
export async function deleteProduct(id: string) {
  await connectMongoose();
  const p = await Product.findById(id);
  if (!p) throw new CatalogError("Product not found.");
  const slug = p.slug;
  await Product.updateOne({ _id: p._id }, { status: "archived" });
  await (p as unknown as { softDelete(): Promise<unknown> }).softDelete();
  return { slug };
}

export async function productOptionsForPicker(): Promise<{ id: string; title: string; status: ProductStatus }[]> {
  await connectMongoose();
  const docs = await Product.find().sort({ "title.en": 1 }).select("title status").limit(1000).lean<AnyDoc[]>();
  return docs.map((p) => ({
    id: p._id.toString(),
    title: (p.title as { en: string }).en,
    status: p.status as ProductStatus,
  }));
}
