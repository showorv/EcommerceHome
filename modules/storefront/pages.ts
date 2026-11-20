import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connectMongoose } from "@/lib/db/mongo";
import { TAGS } from "@/modules/catalog/cache-tags";
import { Category, Collection } from "@/modules/catalog/models";
import { Page } from "./models";
import { cleanSections, defaultHomeSections, isLive, nextChange, type Section } from "./sections";

/**
 * Builder pages: draft → publish now or at a set time (FR-AD-07). Callers check permissions, write the
 * audit log and refresh the page's cache tag.
 */

export const BUILDER_PAGES = { home: "Home page" } as const;
export type BuilderPageSlug = keyof typeof BUILDER_PAGES;
export const isBuilderPage = (s: string): s is BuilderPageSlug => Object.hasOwn(BUILDER_PAGES, s);

/** Errors with a message that is safe to show in the admin. */
export class PageError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

type Version = { sections: Section[]; at: string; by: string | null };
export type PageState = {
  slug: BuilderPageSlug;
  title: string;
  version: number;
  draft: Version;
  published: Version | null;
  scheduled: Version | null;
  /** The draft differs from what the store shows. */
  hasChanges: boolean;
};

/** Built-in starter sections, normalised like stored ones so comparisons are exact. */
const defaults = (slug: BuilderPageSlug): Section[] => cleanSections(slug === "home" ? defaultHomeSections() : []);

function toVersion(v: AnyDoc | null | undefined): Version | null {
  if (!v) return null;
  return { sections: cleanSections(v.sections), at: new Date(v.at).toISOString(), by: v.by ? String(v.by) : null };
}

const same = (a: Section[], b: Section[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The page for the builder. Creates it on first use (draft = the built-in default sections), and moves a
 * scheduled version that is due into "published", so the builder always shows the truth.
 */
export async function getPageForEdit(slug: BuilderPageSlug): Promise<PageState> {
  await connectMongoose();
  let doc = await Page.findOne({ slug }).lean<AnyDoc>();
  if (!doc) {
    try {
      await Page.create({ slug, title: BUILDER_PAGES[slug], draft: { sections: defaults(slug), at: new Date() } });
    } catch (err) {
      if (!(err && typeof err === "object" && "code" in err && err.code === 11000)) throw err; // created meanwhile
    }
    doc = await Page.findOne({ slug }).lean<AnyDoc>();
  }
  if (doc?.scheduled && new Date(doc.scheduled.at).getTime() <= Date.now()) {
    await Page.updateOne(
      { slug, "scheduled.at": doc.scheduled.at },
      { $set: { published: doc.scheduled, scheduled: null } },
    );
    doc = await Page.findOne({ slug }).lean<AnyDoc>();
  }
  if (!doc) throw new PageError("Page not found.");
  const draft = toVersion(doc.draft)!;
  const published = toVersion(doc.published);
  const scheduled = toVersion(doc.scheduled);
  return {
    slug,
    title: String(doc.title || BUILDER_PAGES[slug]),
    version: Number(doc.version ?? 0),
    draft,
    published,
    scheduled,
    hasChanges: !same(draft.sections, (scheduled ?? published)?.sections ?? defaults(slug)),
  };
}

/** Writes `set` only if nobody saved since `version`; otherwise explains what happened. */
async function writeIfCurrent(slug: BuilderPageSlug, version: number, set: Record<string, unknown>) {
  await connectMongoose();
  const res = await Page.updateOne({ slug, version }, { $set: set, $inc: { version: 1 } });
  if (res.matchedCount === 0) {
    throw new PageError("Someone else changed this page a moment ago. Reload to see their changes, then try again.");
  }
  return getPageForEdit(slug);
}

export function saveDraft(slug: BuilderPageSlug, sections: Section[], version: number, by: string) {
  return writeIfCurrent(slug, version, { draft: { sections, at: new Date(), by } });
}

/** Saves the sections and makes them live now (cancels any scheduled version). */
export function publishNow(slug: BuilderPageSlug, sections: Section[], version: number, by: string) {
  const v = { sections, at: new Date(), by };
  return writeIfCurrent(slug, version, { draft: v, published: v, scheduled: null });
}

/** Saves the sections and makes them live at `at` (the current published version stays until then). */
export function schedulePublish(slug: BuilderPageSlug, sections: Section[], at: Date, version: number, by: string) {
  if (at.getTime() <= Date.now() + 60_000) throw new PageError("Pick a time at least a minute from now.");
  return writeIfCurrent(slug, version, {
    draft: { sections, at: new Date(), by },
    scheduled: { sections, at, by },
  });
}

export function cancelSchedule(slug: BuilderPageSlug, version: number) {
  return writeIfCurrent(slug, version, { scheduled: null });
}

/** Throws the draft away: back to what the store shows (or will show, if scheduled). */
export async function discardDraft(slug: BuilderPageSlug, version: number, by: string) {
  const page = await getPageForEdit(slug);
  const base = (page.scheduled ?? page.published)?.sections ?? defaults(slug);
  return writeIfCurrent(slug, version, { draft: { sections: base, at: new Date(), by } });
}

// ---------- Storefront ----------

/**
 * Sections the store shows right now: the published version (or the scheduled one once its time has
 * come, or the defaults before the first publish), minus hidden sections and those outside their dates.
 * Cached; the cache refreshes at the next start/end/scheduled time and whenever the page is published.
 */
export async function getLiveSections(slug: BuilderPageSlug): Promise<Section[]> {
  "use cache";
  cacheTag(TAGS.page(slug));
  await connectMongoose();
  const doc = await Page.findOne({ slug }).select("published scheduled").lean<AnyDoc>();
  const now = Date.now();
  const scheduledAt = doc?.scheduled ? new Date(doc.scheduled.at).getTime() : null;
  const current =
    scheduledAt !== null && scheduledAt <= now
      ? cleanSections(doc!.scheduled.sections)
      : doc?.published
        ? cleanSections(doc.published.sections)
        : defaults(slug);

  const boundaries = [nextChange(current, now), scheduledAt !== null && scheduledAt > now ? scheduledAt : null].filter(
    (t): t is number => t !== null,
  );
  const untilNext = boundaries.length ? Math.ceil((Math.min(...boundaries) - now) / 1000) : null;
  // Refresh at the next change (at least a minute apart, at most an hour). The first visit after it
  // triggers the refresh in the background, so at worst one visitor sees the old version.
  cacheLife({
    stale: 300,
    revalidate: untilNext === null ? 3600 : Math.max(60, Math.min(3600, untilNext)),
    expire: 86_400,
  });
  return current.filter((s) => isLive(s, now));
}

/** Draft sections for the preview page (never cached), with the same date rules applied. */
export async function getDraftSections(slug: BuilderPageSlug): Promise<Section[]> {
  const page = await getPageForEdit(slug);
  const now = Date.now();
  return page.draft.sections.filter((s) => isLive(s, now));
}

// ---------- Builder pickers ----------

/** Categories (with their parents' names) and collections the builder's pickers offer. */
export async function getBuilderOptions() {
  await connectMongoose();
  const [cats, cols] = await Promise.all([
    Category.find().select("name parentId").sort({ order: 1, "name.en": 1 }).lean<AnyDoc[]>(),
    Collection.find().select("name active").sort({ "name.en": 1 }).lean<AnyDoc[]>(),
  ]);
  const byId = new Map(cats.map((c) => [String(c._id), c]));
  const path = (c: AnyDoc) => {
    const names = [String(c.name?.en ?? "")];
    let parent = c.parentId ? byId.get(String(c.parentId)) : undefined;
    for (let i = 0; parent && i < 10; i++) {
      names.unshift(String(parent.name?.en ?? ""));
      parent = parent.parentId ? byId.get(String(parent.parentId)) : undefined;
    }
    return names.join(" › ");
  };
  return {
    categories: cats.map((c) => ({ id: String(c._id), name: path(c) })).sort((a, b) => a.name.localeCompare(b.name)),
    collections: cols.map((c) => ({
      id: String(c._id),
      name: `${String(c.name?.en ?? "")}${c.active === false ? " (switched off)" : ""}`,
    })),
  };
}
