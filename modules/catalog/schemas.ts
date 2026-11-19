import { z } from "zod";
import { BLOCK_TYPES, MEDIA_TYPES, MOVEMENT_REASONS, PRODUCT_LABELS, PRODUCT_STATUSES } from "./models";
import { SLUG_RE } from "./logic";

/**
 * Validation for every catalogue write (NFR-SEC-09). Admin forms send prices in taka
 * (e.g. 1450.5); these schemas convert them to integer poisha.
 */

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");
const text = (max: number) => z.string().trim().max(max);
const i18n = (max: number, required = true) =>
  z.object({ en: required ? text(max).min(1, "English name is required") : text(max), bn: text(max).default("") });

export const takaToPoisha = z.coerce
  .number({ error: "Enter a number" })
  .min(0, "Must be 0 or more")
  .max(10_000_000, "Too large")
  .transform((t) => Math.round(t * 100));

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .refine((s) => s === "" || SLUG_RE.test(s), "Use lowercase letters, numbers and hyphens only");

/**
 * Files we can actually show: Cloudinary, or our own development uploads under /uploads/.
 * The storefront's Content-Security-Policy blocks images from any other site.
 */
export function isStoredMediaUrl(u: string): boolean {
  return /^\/uploads\/(images|videos)\/[\w.-]+$/.test(u) || /^https:\/\/res\.cloudinary\.com\/[^\s]+$/.test(u);
}

export const mediaUrl = z
  .string()
  .trim()
  .max(1000)
  .refine(isStoredMediaUrl, "Upload the file (links to other websites can't be shown on the store)");

const optionalMediaUrl = z.union([z.literal(""), mediaUrl]).default("");

const seo = z
  .object({ title: text(70).default(""), description: text(170).default(""), ogImage: optionalMediaUrl })
  .default({ title: "", description: "", ogImage: "" });

const imageRef = z.object({ url: optionalMediaUrl, alt: text(200).default("") }).default({ url: "", alt: "" });

// ---------- Categories ----------

export const categoryInput = z.object({
  name: i18n(80),
  slug,
  parentId: z.union([z.literal(""), objectId]).default(""),
  description: i18n(500, false).default({ en: "", bn: "" }),
  image: imageRef,
  order: z.coerce.number().int().min(0).max(10_000).default(0),
  active: z.boolean().default(true),
  seo,
});
export type CategoryInput = z.infer<typeof categoryInput>;

// ---------- Collections ----------

const ruleInput = z.discriminatedUnion("field", [
  z.object({ field: z.literal("price"), op: z.enum(["lt", "lte", "gt", "gte"]), value: takaToPoisha }),
  z.object({ field: z.literal("category"), op: z.literal("in"), value: z.array(objectId).min(1).max(50) }),
  z.object({ field: z.literal("tag"), op: z.literal("in"), value: z.array(text(40).min(1)).min(1).max(50) }),
  z.object({ field: z.literal("label"), op: z.literal("in"), value: z.array(z.enum(PRODUCT_LABELS)).min(1) }),
  z.object({ field: z.literal("inStock"), op: z.literal("eq"), value: z.boolean() }),
  z.object({ field: z.literal("onSale"), op: z.literal("eq"), value: z.boolean() }),
]);

export const collectionInput = z
  .object({
    name: i18n(80),
    slug,
    description: i18n(500, false).default({ en: "", bn: "" }),
    image: imageRef,
    type: z.enum(["manual", "rule"]),
    match: z.enum(["all", "any"]).default("all"),
    rules: z.array(ruleInput).max(10).default([]),
    productIds: z.array(objectId).max(500).default([]),
    sort: z.enum(["manual", "newest", "price_asc", "price_desc", "bestselling"]).default("newest"),
    active: z.boolean().default(true),
    seo,
  })
  .refine((c) => c.type === "manual" || c.rules.length > 0, { message: "Add at least one rule", path: ["rules"] });
export type CollectionInput = z.infer<typeof collectionInput>;

// ---------- Products ----------

const mediaInput = z
  .object({
    id: z.string().max(40).optional(), // existing media _id (kept so variants keep their links)
    type: z.enum(MEDIA_TYPES),
    url: z.string().trim().max(1000),
    alt: text(200).default(""),
    poster: optionalMediaUrl,
    width: z.coerce.number().int().min(0).max(20_000).default(0),
    height: z.coerce.number().int().min(0).max(20_000).default(0),
    focalX: z.coerce.number().min(0).max(100).default(50),
    focalY: z.coerce.number().min(0).max(100).default(50),
    autoplayOnHover: z.boolean().default(false),
  })
  .refine((m) => (m.type === "youtube" ? youtubeId(m.url) !== null : isStoredMediaUrl(m.url)), {
    message: "Upload images and videos, or paste a YouTube link (other websites can't be shown on the store)",
    path: ["url"],
  });

export function youtubeId(url: string): string | null {
  const m = url.match(/^https:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m?.[1] ?? null;
}

const rows = z.array(z.object({ label: text(80), value: text(300) })).max(60);

const blockInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), data: z.object({ heading: text(120).default(""), body: text(5000) }) }),
  z.object({
    type: z.literal("image"),
    data: z.object({ url: mediaUrl, alt: text(200).default(""), caption: text(200).default("") }),
  }),
  z.object({
    type: z.literal("video"),
    data: z.object({
      url: z
        .string()
        .trim()
        .max(1000)
        .refine((u) => isStoredMediaUrl(u) || youtubeId(u) !== null, "Upload a video or paste a YouTube link"),
      caption: text(200).default(""),
    }),
  }),
  z.object({ type: z.literal("specs"), data: z.object({ heading: text(120).default("Specifications"), rows }) }),
  z.object({
    type: z.literal("inBox"),
    data: z.object({ heading: text(120).default("What's in the box"), items: z.array(text(120)).max(40) }),
  }),
  z.object({
    type: z.literal("comparison"),
    data: z.object({
      heading: text(120).default(""),
      columns: z.array(text(60)).min(2).max(5),
      rows: z.array(z.object({ label: text(80), values: z.array(text(120)).max(5) })).max(40),
    }),
  }),
]);
export type BlockInput = z.infer<typeof blockInput>;
export const BLOCK_TYPE_LIST = BLOCK_TYPES;

const variantInput = z.object({
  id: z.union([z.literal(""), objectId]).default(""),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "SKU is required")
    .max(40)
    .regex(/^[A-Z0-9][A-Z0-9_-]*$/, "SKU: letters, numbers, - and _ only"),
  options: z.record(text(40), text(60)).default({}),
  price: takaToPoisha,
  compareAtPrice: takaToPoisha.default(0),
  weightGrams: z.coerce.number().int().min(0).max(100_000).default(0),
  lowStockAt: z.union([z.literal(""), z.null(), z.coerce.number().int().min(0).max(100_000)]).default(null),
  mediaIds: z.array(z.string().max(40)).max(30).default([]),
  active: z.boolean().default(true),
  // Only used when the variant is created; later stock changes go through inventory adjustments.
  initialStock: z.coerce.number().int().min(0).max(1_000_000).default(0),
  initialCost: takaToPoisha.default(0),
});

export const productInput = z
  .object({
    title: i18n(150),
    slug,
    status: z.enum(PRODUCT_STATUSES),
    categoryIds: z.array(objectId).max(20).default([]),
    tags: z.array(text(40).min(1)).max(30).default([]),
    labels: z.array(z.enum(PRODUCT_LABELS)).max(5).default([]),
    shortDescription: i18n(400, false).default({ en: "", bn: "" }),
    blocks: z.array(blockInput).max(40).default([]),
    specs: rows.default([]),
    media: z.array(mediaInput).max(30).default([]),
    hoverMediaIndex: z.coerce.number().int().min(0).max(29).default(1),
    optionNames: z.array(text(30).min(1)).max(3).default([]),
    lowStockAt: z.coerce.number().int().min(0).max(100_000).default(5),
    seo,
    variants: z.array(variantInput).min(1, "Add at least one variant").max(100),
  })
  .superRefine((p, ctx) => {
    const skus = p.variants.map((v) => v.sku);
    const dup = skus.find((s, i) => skus.indexOf(s) !== i);
    if (dup) ctx.addIssue({ code: "custom", message: `SKU ${dup} is used twice`, path: ["variants"] });
    const combos = p.variants.map((v) => p.optionNames.map((n) => v.options[n] ?? "").join("|"));
    if (p.optionNames.length && combos.some((c, i) => combos.indexOf(c) !== i))
      ctx.addIssue({ code: "custom", message: "Two variants have the same options", path: ["variants"] });
    for (const v of p.variants) {
      if (v.compareAtPrice && v.compareAtPrice <= v.price)
        ctx.addIssue({
          code: "custom",
          message: `${v.sku}: compare-at price must be higher than the price`,
          path: ["variants"],
        });
    }
    if (p.status === "active" && p.media.filter((m) => m.type === "image").length === 0)
      ctx.addIssue({
        code: "custom",
        message: "Add at least one image before making the product active",
        path: ["media"],
      });
  });
export type ProductInput = z.infer<typeof productInput>;

// ---------- Inventory ----------

export const adjustStockInput = z.object({
  variantId: objectId,
  change: z.coerce
    .number()
    .int()
    .min(-100_000)
    .max(100_000)
    .refine((n) => n !== 0, "Change cannot be 0"),
  reason: z.enum(MOVEMENT_REASONS).refine((r) => ["adjust", "damage", "return"].includes(r), "Pick a reason"),
  note: text(300).default(""),
});

export const purchaseBatchInput = z.object({
  supplier: text(120).default(""),
  receivedAt: z.coerce.date(),
  shippingCost: takaToPoisha.default(0),
  customsCost: takaToPoisha.default(0),
  otherCost: takaToPoisha.default(0),
  note: text(500).default(""),
  items: z
    .array(z.object({ variantId: objectId, qty: z.coerce.number().int().min(1).max(100_000), unitCost: takaToPoisha }))
    .min(1, "Add at least one item")
    .max(200)
    .refine((items) => new Set(items.map((i) => i.variantId)).size === items.length, "Each variant only once"),
});
export type PurchaseBatchInput = z.infer<typeof purchaseBatchInput>;

/** Turns zod issues into one short message for a toast. */
export function firstError(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? issue.message : "Check the form.";
}
