import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connectMongoose } from "@/lib/db/mongo";
import { TAGS } from "@/modules/catalog/cache-tags";
import { announcementLive, announcementNextChange, cleanDesign, defaultDesign, type Design } from "./design";
import { SiteDesign } from "./models";
import { PageError } from "./pages";

/**
 * Store design: draft → publish (FR-AD-07 menu editor + theme editor). Callers check permissions,
 * write the audit log and refresh the design cache tag.
 */

const KEY = "store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

type Version = { design: Design; at: string; by: string | null };
export type DesignState = { version: number; draft: Version; published: Version | null; hasChanges: boolean };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function toVersion(v: AnyDoc | null | undefined): Version | null {
  if (!v) return null;
  return { design: cleanDesign(v.design), at: new Date(v.at).toISOString(), by: v.by ? String(v.by) : null };
}

export async function getDesignForEdit(): Promise<DesignState> {
  await connectMongoose();
  let doc = await SiteDesign.findOne({ key: KEY }).lean<AnyDoc>();
  if (!doc) {
    try {
      await SiteDesign.create({ key: KEY, draft: { design: defaultDesign(), at: new Date() } });
    } catch (err) {
      if (!(err && typeof err === "object" && "code" in err && err.code === 11000)) throw err;
    }
    doc = await SiteDesign.findOne({ key: KEY }).lean<AnyDoc>();
  }
  if (!doc) throw new PageError("Design settings not found.");
  const draft = toVersion(doc.draft)!;
  const published = toVersion(doc.published);
  return {
    version: Number(doc.version ?? 0),
    draft,
    published,
    hasChanges: !same(draft.design, published?.design ?? defaultDesign()),
  };
}

async function writeIfCurrent(version: number, set: Record<string, unknown>) {
  await connectMongoose();
  const res = await SiteDesign.updateOne({ key: KEY, version }, { $set: set, $inc: { version: 1 } });
  if (res.matchedCount === 0) {
    throw new PageError(
      "Someone else changed these settings a moment ago. Reload to see their changes, then try again.",
    );
  }
  return getDesignForEdit();
}

export function saveDesignDraft(design: Design, version: number, by: string) {
  return writeIfCurrent(version, { draft: { design, at: new Date(), by } });
}

export function publishDesign(design: Design, version: number, by: string) {
  const v = { design, at: new Date(), by };
  return writeIfCurrent(version, { draft: v, published: v });
}

export async function discardDesignDraft(version: number, by: string) {
  const state = await getDesignForEdit();
  return writeIfCurrent(version, {
    draft: { design: state.published?.design ?? defaultDesign(), at: new Date(), by },
  });
}

/** Switches the announcement bar off outside its start / stop dates. */
function atTime(design: Design, now: number): Design {
  const a = design.navigation.announcement;
  if (!a.enabled || announcementLive(a, now)) return design;
  return { ...design, navigation: { ...design.navigation, announcement: { ...a, enabled: false } } };
}

/** What the store shows. Cached; refreshes on publish and when the announcement bar starts or stops. */
export async function getLiveDesign(): Promise<Design> {
  "use cache";
  cacheTag(TAGS.design);
  await connectMongoose();
  const doc = await SiteDesign.findOne({ key: KEY }).select("published").lean<AnyDoc>();
  const design = doc?.published ? cleanDesign(doc.published.design) : defaultDesign();
  const next = announcementNextChange(design.navigation.announcement, Date.now());
  const untilNext = next === null ? null : Math.ceil((next - Date.now()) / 1000);
  cacheLife({
    stale: 300,
    revalidate: untilNext === null ? 3600 : Math.max(60, Math.min(3600, untilNext)),
    expire: 86_400,
  });
  return design;
}

/** The draft, for the preview page (never cached). */
export async function getDraftDesign(): Promise<Design> {
  return atTime((await getDesignForEdit()).draft.design, Date.now());
}
