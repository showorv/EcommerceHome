import mongoose, { Schema, type Model } from "mongoose";

/**
 * CMS pages (SRS §7 "pages", FR-SF-09): a draft being edited and the published version the store shows.
 * `slug` is the live address (/pages/<slug>); the draft can carry a new slug that takes over on publish.
 * Content is validated by zod (blocks.ts) on every write and again when read.
 */
const contentVersionSchema = new Schema(
  {
    content: { type: Schema.Types.Mixed, default: {} }, // { title, slug, seoTitle, seoDescription, blocks }
    at: { type: Date, required: true },
    by: { type: String, default: null },
  },
  { _id: false },
);

const cmsPageSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    draft: { type: contentVersionSchema, required: true },
    published: { type: contentVersionSchema, default: null },
    version: { type: Number, default: 0 },
  },
  { collection: "cmsPages", timestamps: true },
);

/** Messages sent from the Contact page form. */
const contactMessageSchema = new Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    message: { type: String, required: true },
    page: { type: String, default: "" }, // slug of the page the form was on
    handledAt: { type: Date, default: null },
    handledBy: { type: String, default: null },
  },
  { collection: "contactMessages", timestamps: true },
);
contactMessageSchema.index({ handledAt: 1, createdAt: -1 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- writes validated by zod, reads mapped by hand
type LooseModel = Model<any>;
function model(name: string, schema: Schema): LooseModel {
  return (mongoose.models[name] as LooseModel | undefined) ?? mongoose.model(name, schema);
}

export const CmsPage = model("CmsPage", cmsPageSchema);
export const ContactMessage = model("ContactMessage", contactMessageSchema);
