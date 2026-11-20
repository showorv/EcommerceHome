import mongoose, { Schema, type Model } from "mongoose";

/**
 * Storefront pages (SRS §7 "pages"): the sections a page is built from, as three versions —
 * the draft being edited, the published one the store shows, and an optional scheduled one that
 * replaces the published one at a set time. Sections are validated by zod (sections.ts) on every write
 * and again when read.
 */

const versionSchema = new Schema(
  {
    sections: { type: [Schema.Types.Mixed], default: [] },
    at: { type: Date, required: true }, // saved / published / goes live at
    by: { type: String, default: null }, // staff user id
  },
  { _id: false },
);

const pageSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, default: "" },
    draft: { type: versionSchema, required: true },
    published: { type: versionSchema, default: null },
    scheduled: { type: versionSchema, default: null },
    /** Bumped on every save, so two people editing at once can't overwrite each other unnoticed. */
    version: { type: Number, default: 0 },
  },
  { collection: "pages", timestamps: true },
);

/**
 * Store design (SRS §7 "navigation" + "themeSettings", kept in one document so menus and theme are
 * previewed and published together): a draft and the published version. Validated by design.ts.
 */
const designVersionSchema = new Schema(
  {
    design: { type: Schema.Types.Mixed, default: {} },
    at: { type: Date, required: true },
    by: { type: String, default: null },
  },
  { _id: false },
);

const siteDesignSchema = new Schema(
  {
    key: { type: String, required: true, unique: true }, // "store"
    draft: { type: designVersionSchema, required: true },
    published: { type: designVersionSchema, default: null },
    version: { type: Number, default: 0 },
  },
  { collection: "siteDesign", timestamps: true },
);

const newsletterSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    source: { type: String, default: "" }, // e.g. "home"
    unsubscribedAt: { type: Date, default: null },
  },
  { collection: "newsletterSubscribers", timestamps: true },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- writes validated by zod, reads mapped by hand
type LooseModel = Model<any>;
function model(name: string, schema: Schema): LooseModel {
  return (mongoose.models[name] as LooseModel | undefined) ?? mongoose.model(name, schema);
}

export const Page = model("Page", pageSchema);
export const SiteDesign = model("SiteDesign", siteDesignSchema);
export const NewsletterSubscriber = model("NewsletterSubscriber", newsletterSchema);
