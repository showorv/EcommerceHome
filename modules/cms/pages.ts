import "server-only";
import { isValidObjectId } from "mongoose";
import { cacheLife, cacheTag } from "next/cache";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { TAGS } from "@/modules/catalog/cache-tags";
import { cleanContent, type CmsContent } from "./blocks";
import { CmsPage } from "./models";
import { standardPages } from "./templates";

/**
 * CMS pages (FR-SF-09): create, edit the draft, publish, unpublish, delete. Callers check permissions,
 * write the audit log and refresh the cache tags.
 */

/** Errors with a message that is safe to show in the admin. */
export class CmsError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

type Version = { content: CmsContent; at: string; by: string | null };
export type CmsPageState = {
  id: string;
  /** The live address (or the address it will get, if never published). */
  slug: string;
  version: number;
  draft: Version;
  published: Version | null;
  /** The draft differs from what the store shows. */
  hasChanges: boolean;
};

export type CmsPageRow = {
  id: string;
  title: string;
  slug: string;
  status: "live" | "changes" | "draft";
  updatedAt: string;
};

function toVersion(v: AnyDoc | null | undefined): Version | null {
  if (!v) return null;
  return { content: cleanContent(v.content), at: new Date(v.at).toISOString(), by: v.by ? String(v.by) : null };
}

const same = (a: CmsContent, b: CmsContent) => JSON.stringify(a) === JSON.stringify(b);

function toState(doc: AnyDoc): CmsPageState {
  const draft = toVersion(doc.draft)!;
  const published = toVersion(doc.published);
  return {
    id: String(doc._id),
    slug: String(doc.slug),
    version: Number(doc.version ?? 0),
    draft,
    published,
    hasChanges: !published || !same(draft.content, published.content),
  };
}

export async function listPages(): Promise<CmsPageRow[]> {
  await connectMongoose();
  const docs = await CmsPage.find().sort({ updatedAt: -1, _id: 1 }).lean<AnyDoc[]>();
  return docs.map((d) => {
    const s = toState(d);
    return {
      id: s.id,
      title: s.draft.content.title || s.published?.content.title || "(untitled)",
      slug: s.slug,
      status: !s.published ? "draft" : s.hasChanges ? "changes" : "live",
      updatedAt: new Date(d.updatedAt).toISOString(),
    };
  });
}

/**
 * The first time anyone opens Pages, adds the standard pages (About, Privacy, Terms, Returns, Shipping,
 * FAQ, Contact) as unpublished drafts. Returns how many were added. Pages deleted later stay deleted.
 */
export async function ensureStandardPages(by: string): Promise<number> {
  await connectMongoose();
  if ((await CmsPage.estimatedDocumentCount()) > 0) return 0;
  const store = process.env.STORE_NAME ?? "our store";
  const now = new Date();
  try {
    const docs = await CmsPage.insertMany(
      standardPages(store).map((c) => ({ slug: c.slug, draft: { content: cleanContent(c), at: now, by } })),
      { ordered: false },
    );
    return docs.length;
  } catch (err) {
    // Someone else opened Pages at the same moment: their copies win.
    if (err && typeof err === "object" && "code" in err && err.code === 11000) return 0;
    throw err;
  }
}

export async function getPageForEdit(id: string): Promise<CmsPageState | null> {
  if (!isValidObjectId(id)) return null;
  await connectMongoose();
  const doc = await CmsPage.findById(id).lean<AnyDoc>();
  return doc ? toState(doc) : null;
}

/** Throws when another page already uses (or is about to use) this address. */
async function assertSlugFree(slug: string, exceptId?: string) {
  // Built from validated values only (sanitizeFilter is on; see lib/db/trusted-filter.ts).
  const clash = await CmsPage.exists(
    trustFilter({
      ...(exceptId ? { _id: { $ne: exceptId } } : {}),
      $or: [{ slug }, { "draft.content.slug": slug }],
    }),
  );
  if (clash) throw new CmsError(`Another page already uses the address /pages/${slug}. Pick a different one.`);
}

export async function createPage(content: CmsContent, by: string): Promise<CmsPageState> {
  await connectMongoose();
  await assertSlugFree(content.slug);
  try {
    const doc = await CmsPage.create({ slug: content.slug, draft: { content, at: new Date(), by } });
    return toState(doc.toObject());
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      throw new CmsError(`Another page already uses the address /pages/${content.slug}. Pick a different one.`);
    }
    throw err;
  }
}

/** Writes `set` only if nobody saved since `version`; otherwise explains what happened. */
async function writeIfCurrent(id: string, version: number, set: Record<string, unknown>): Promise<CmsPageState> {
  if (!isValidObjectId(id)) throw new CmsError("Page not found.");
  await connectMongoose();
  let res;
  try {
    res = await CmsPage.updateOne({ _id: id, version }, { $set: set, $inc: { version: 1 } });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      throw new CmsError("Another page already uses this address. Pick a different one.");
    }
    throw err;
  }
  if (res.matchedCount === 0) {
    const exists = await CmsPage.exists({ _id: id });
    throw new CmsError(
      exists
        ? "Someone else changed this page a moment ago. Reload to see their changes, then try again."
        : "This page was deleted.",
    );
  }
  return (await getPageForEdit(id))!;
}

export async function saveDraft(id: string, content: CmsContent, version: number, by: string) {
  await connectMongoose();
  await assertSlugFree(content.slug, id);
  const current = await getPageForEdit(id);
  if (!current) throw new CmsError("This page was deleted.");
  // A page that was never published moves to its new address straight away.
  const extra = current.published ? {} : { slug: content.slug };
  return writeIfCurrent(id, version, { draft: { content, at: new Date(), by }, ...extra });
}

/** Saves and makes the content live. Returns the address it had before, so its cache can be cleared. */
export async function publish(id: string, content: CmsContent, version: number, by: string) {
  await connectMongoose();
  await assertSlugFree(content.slug, id);
  const before = await getPageForEdit(id);
  if (!before) throw new CmsError("This page was deleted.");
  const v = { content, at: new Date(), by };
  const page = await writeIfCurrent(id, version, { draft: v, published: v, slug: content.slug });
  return { page, previousSlug: before.slug };
}

/** Takes the page off the store; the draft stays. */
export async function unpublish(id: string, version: number) {
  return writeIfCurrent(id, version, { published: null });
}

/** Throws the draft away: back to the published content. */
export async function discardDraft(id: string, version: number, by: string) {
  const page = await getPageForEdit(id);
  if (!page) throw new CmsError("This page was deleted.");
  if (!page.published) throw new CmsError("This page was never published, so there is nothing to go back to.");
  return writeIfCurrent(id, version, { draft: { content: page.published.content, at: new Date(), by } });
}

/** Deletes the page for good. Returns what it held, for the audit log. */
export async function deletePage(id: string, version: number): Promise<CmsPageState> {
  const page = await getPageForEdit(id);
  if (!page) throw new CmsError("This page was already deleted.");
  const res = await CmsPage.deleteOne({ _id: id, version });
  if (res.deletedCount === 0) {
    throw new CmsError("Someone else changed this page a moment ago. Reload, then try again.");
  }
  return page;
}

// ---------- Storefront ----------

export type LivePage = CmsContent & { updatedAt: string };

/** The published page at /pages/<slug>, or null. Cached until it is published, unpublished or deleted. */
export async function getLivePage(slug: string): Promise<LivePage | null> {
  "use cache";
  cacheTag(TAGS.cmsPage(slug));
  cacheLife("days");
  await connectMongoose();
  const doc = await CmsPage.findOne(trustFilter({ slug, published: { $ne: null } }))
    .select("published")
    .lean<AnyDoc>();
  if (!doc) return null;
  return { ...cleanContent(doc.published.content), updatedAt: new Date(doc.published.at).toISOString() };
}

/** Addresses and titles of all published pages (static generation, link suggestions, sitemap). */
export async function getLivePageList(): Promise<{ slug: string; title: string; updatedAt: string }[]> {
  "use cache";
  cacheTag(TAGS.cmsPages);
  cacheLife("days");
  await connectMongoose();
  const docs = await CmsPage.find(trustFilter({ published: { $ne: null } }))
    .select("slug published.content.title published.at")
    .sort({ slug: 1 })
    .lean<AnyDoc[]>();
  return docs.map((d) => ({
    slug: String(d.slug),
    title: String(d.published?.content?.title ?? d.slug),
    updatedAt: new Date(d.published.at).toISOString(),
  }));
}
