import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { softDeletePlugin } from "@/modules/shared/soft-delete";

/**
 * Catalogue collections (SRS §7): categories, collections, products, variants,
 * inventoryMovements, purchaseBatches. Money fields are integer poisha.
 * `mongoose.models.X ??` keeps hot reload in development from redefining models.
 */

const i18nText = { en: { type: String, required: true, trim: true }, bn: { type: String, default: "", trim: true } };
const i18nOptional = { en: { type: String, default: "", trim: true }, bn: { type: String, default: "", trim: true } };

const seoSchema = new Schema(
  {
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    ogImage: { type: String, default: "" },
  },
  { _id: false },
);

const imageRefSchema = new Schema(
  { url: { type: String, default: "" }, alt: { type: String, default: "" } },
  { _id: false },
);

// ---------- Categories ----------

const categorySchema = new Schema(
  {
    name: i18nText,
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    description: i18nOptional,
    image: { type: imageRefSchema, default: () => ({}) },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    seo: { type: seoSchema, default: () => ({}) },
  },
  { collection: "categories", timestamps: true },
);
categorySchema.plugin(softDeletePlugin);
categorySchema.index({ parentId: 1, order: 1 });

// ---------- Collections (manual or rule-based) ----------

export const RULE_FIELDS = ["price", "category", "tag", "label", "inStock", "onSale"] as const;
export const RULE_OPS = ["lt", "lte", "gt", "gte", "eq", "in"] as const;

const ruleSchema = new Schema(
  {
    field: { type: String, enum: RULE_FIELDS, required: true },
    op: { type: String, enum: RULE_OPS, required: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

const collectionSchema = new Schema(
  {
    name: i18nText,
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: i18nOptional,
    image: { type: imageRefSchema, default: () => ({}) },
    type: { type: String, enum: ["manual", "rule"], required: true, default: "manual" },
    match: { type: String, enum: ["all", "any"], default: "all" },
    rules: { type: [ruleSchema], default: [] },
    productIds: { type: [Schema.Types.ObjectId], default: [] }, // manual collections, in display order
    sort: { type: String, enum: ["manual", "newest", "price_asc", "price_desc", "bestselling"], default: "newest" },
    active: { type: Boolean, default: true },
    seo: { type: seoSchema, default: () => ({}) },
  },
  { collection: "collections", timestamps: true },
);
collectionSchema.plugin(softDeletePlugin);

// ---------- Products ----------

export const MEDIA_TYPES = ["image", "video", "youtube", "model"] as const;
export const PRODUCT_LABELS = ["new", "hot", "bestseller", "sale", "limited"] as const;
export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export const BLOCK_TYPES = ["text", "image", "video", "specs", "inBox", "comparison"] as const;

const mediaSchema = new Schema(
  {
    type: { type: String, enum: MEDIA_TYPES, required: true },
    url: { type: String, required: true },
    alt: { type: String, default: "" },
    poster: { type: String, default: "" }, // video poster image
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    focalX: { type: Number, default: 50, min: 0, max: 100 }, // focal point in %, used for object-position
    focalY: { type: Number, default: 50, min: 0, max: 100 },
    autoplayOnHover: { type: Boolean, default: false }, // FR-PC-05 (videos only)
  },
  { _id: true },
);

const blockSchema = new Schema(
  {
    type: { type: String, enum: BLOCK_TYPES, required: true },
    data: { type: Schema.Types.Mixed, default: {} }, // shape validated by zod (modules/catalog/schemas.ts)
  },
  { _id: true },
);

const productSchema = new Schema(
  {
    title: i18nText,
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: { type: String, enum: PRODUCT_STATUSES, default: "draft", index: true },
    categoryIds: { type: [Schema.Types.ObjectId], default: [], index: true },
    tags: { type: [String], default: [], index: true },
    labels: { type: [String], enum: PRODUCT_LABELS, default: [] },
    shortDescription: i18nOptional,
    blocks: { type: [blockSchema], default: [] },
    specs: { type: [new Schema({ label: String, value: String }, { _id: false })], default: [] },
    media: { type: [mediaSchema], default: [] },
    hoverMediaIndex: { type: Number, default: 1 }, // FR-PC-02: which media shows on hover
    optionNames: { type: [String], default: [] }, // e.g. ["Colour", "Size"], max 3
    lowStockAt: { type: Number, default: 5 },
    seo: { type: seoSchema, default: () => ({}) },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    sortScore: { type: Number, default: 0 }, // bestseller ranking, updated by orders later
    // Denormalised from variants for listing, filtering and sorting (kept in sync by syncProductFromVariants).
    priceMin: { type: Number, default: 0 },
    priceMax: { type: Number, default: 0 },
    compareAtMax: { type: Number, default: 0 },
    compareAtFrom: { type: Number, default: 0 }, // compare-at price of the cheapest variant (card "was" price)
    maxDiscount: { type: Number, default: 0, index: true }, // biggest % off across variants (sorting/filters)
    totalStock: { type: Number, default: 0 },
    inStock: { type: Boolean, default: false },
    onSale: { type: Boolean, default: false },
    variantCount: { type: Number, default: 0 },
    publishedAt: { type: Date, default: null },
  },
  { collection: "products", timestamps: true },
);
productSchema.plugin(softDeletePlugin);
productSchema.index({ status: 1, categoryIds: 1, priceMin: 1 });
productSchema.index({ status: 1, publishedAt: -1 });
productSchema.index({ status: 1, sortScore: -1 });
productSchema.index({ "title.en": "text", "title.bn": "text", tags: "text" }); // fallback search until Atlas Search (1.9)

// ---------- Variants ----------

const variantSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    options: { type: Map, of: String, default: {} }, // { Colour: "Red", Size: "XL" }
    title: { type: String, default: "" }, // "Red / XL"
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, default: 0, min: 0 },
    costPrice: { type: Number, default: 0, min: 0 }, // weighted average landed cost
    weightGrams: { type: Number, default: 0, min: 0 },
    stock: { type: Number, default: 0 },
    reserved: { type: Number, default: 0, min: 0 },
    lowStockAt: { type: Number, default: null }, // null = use the product's threshold
    mediaIds: { type: [String], default: [] }, // product media _ids shown when this variant is picked
    position: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { collection: "variants", timestamps: true },
);
variantSchema.index({ productId: 1, position: 1 });

// ---------- Inventory movements (append-only history) ----------

export const MOVEMENT_REASONS = ["purchase", "order", "cancel", "return", "adjust", "damage"] as const;

const inventoryMovementSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    change: { type: Number, required: true }, // + in, − out
    stockAfter: { type: Number, required: true },
    reason: { type: String, enum: MOVEMENT_REASONS, required: true },
    refId: { type: String, default: null }, // purchase batch / order id
    note: { type: String, default: "" },
    costPerUnit: { type: Number, default: null },
    byUserId: { type: String, default: null },
  },
  { collection: "inventoryMovements", timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
inventoryMovementSchema.index({ variantId: 1, createdAt: -1 });
inventoryMovementSchema.index({ productId: 1, createdAt: -1 });

// ---------- Purchase batches (landed cost, FR-AD-04) ----------

const batchItemSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    sku: String,
    qty: { type: Number, required: true, min: 1 },
    unitCost: { type: Number, required: true, min: 0 }, // supplier price per unit (poisha)
    landedUnitCost: { type: Number, required: true, min: 0 }, // unit cost + share of extra costs
  },
  { _id: false },
);

const purchaseBatchSchema = new Schema(
  {
    batchNo: { type: String, required: true, unique: true },
    supplier: { type: String, default: "" },
    receivedAt: { type: Date, required: true },
    items: { type: [batchItemSchema], required: true },
    shippingCost: { type: Number, default: 0, min: 0 },
    customsCost: { type: Number, default: 0, min: 0 },
    otherCost: { type: Number, default: 0, min: 0 },
    goodsTotal: { type: Number, required: true },
    landedTotal: { type: Number, required: true },
    note: { type: String, default: "" },
    byUserId: { type: String, default: null },
  },
  { collection: "purchaseBatches", timestamps: true },
);
purchaseBatchSchema.index({ receivedAt: -1 });

// ---------- Models ----------

/**
 * Models are typed loosely on purpose: every write is validated by zod (schemas.ts) and every read
 * is mapped to a plain DTO by hand, so Mongoose's generated document types would only add noise.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseModel = Model<any>;
function model(name: string, schema: Schema): LooseModel {
  return (mongoose.models[name] as LooseModel | undefined) ?? mongoose.model(name, schema);
}

export const Category = model("Category", categorySchema);
export const Collection = model("Collection", collectionSchema);
export const Product = model("Product", productSchema);
export const Variant = model("Variant", variantSchema);
export const InventoryMovement = model("InventoryMovement", inventoryMovementSchema);
export const PurchaseBatch = model("PurchaseBatch", purchaseBatchSchema);

export type CategoryDoc = InferSchemaType<typeof categorySchema>;
export type CollectionDoc = InferSchemaType<typeof collectionSchema>;
export type ProductDoc = InferSchemaType<typeof productSchema>;
export type VariantDoc = InferSchemaType<typeof variantSchema>;
