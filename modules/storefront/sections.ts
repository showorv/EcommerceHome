import { z } from "zod";
import { isStoredMediaUrl, youtubeId } from "@/modules/catalog/media-rules";

/**
 * Storefront sections (FR-SF-01, FR-AD-07): the blocks a page is built from, their validation and
 * defaults, and the scheduling rules. Pure and browser-safe, so the admin builder and the server
 * share one definition.
 *
 * Text is always plain text (line breaks kept), never HTML, so nothing typed in the builder can inject
 * code into the store.
 */

export const SECTION_TYPES = [
  "hero",
  "categoryGrid",
  "productCarousel",
  "banner",
  "video",
  "usp",
  "testimonials",
  "faq",
  "newsletter",
  "richText",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_INFO: Record<SectionType, { name: string; description: string }> = {
  hero: { name: "Hero / slider", description: "Big picture or slides with a heading and buttons" },
  categoryGrid: { name: "Category grid", description: "Tiles linking to categories" },
  productCarousel: { name: "Products", description: "A row or grid of products: newest, best sellers, a collection…" },
  banner: { name: "Promo banner", description: "A picture with a message and a button" },
  video: { name: "Video banner", description: "An uploaded video or a YouTube video with a message" },
  usp: { name: "Why buy from us", description: "Short points like cash on delivery, warranty, fast delivery" },
  testimonials: { name: "Testimonials", description: "What customers say" },
  faq: { name: "FAQ", description: "Questions and answers" },
  newsletter: { name: "Newsletter", description: "Email sign-up for offers" },
  richText: { name: "Text", description: "A heading and paragraphs" },
};

export const USP_ICONS = ["truck", "cash", "shield", "refund", "support", "star", "gift", "clock"] as const;

// ---------- Field rules ----------

const text = (max: number) => z.string().trim().max(max).default("");
const id = z.string().regex(/^[A-Za-z0-9_-]{6,24}$/, "Invalid id");
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

/** Links on buttons: a page of this store ("/c/kitchen") or a secure website / WhatsApp link. */
export function isSafeHref(href: string): boolean {
  if (href === "") return true;
  if (href.startsWith("/")) return !href.startsWith("//") && !/[\s\\]/.test(href);
  return /^https:\/\/[^\s/$.?#][^\s]*$/i.test(href) || /^tel:\+?[0-9 -]{5,20}$/.test(href);
}
export const hrefField = z
  .string()
  .trim()
  .max(500)
  .default("")
  .refine(isSafeHref, "Use a store link starting with / or a link starting with https://");

export const imageField = z
  .object({
    url: z
      .string()
      .trim()
      .max(1000)
      .refine((u) => u === "" || isStoredMediaUrl(u), "Upload the image (links to other websites can't be shown)")
      .default(""),
    alt: text(200),
  })
  .default({ url: "", alt: "" });

const videoUrl = z
  .string()
  .trim()
  .max(1000)
  .default("")
  .refine((u) => u === "" || isStoredMediaUrl(u) || youtubeId(u) !== null, "Upload a video or paste a YouTube link");

/** ISO date-time or null. */
export const whenField = z
  .union([z.iso.datetime({ offset: true }), z.null()])
  .default(null)
  .transform((v) => (v ? new Date(v).toISOString() : null));

// ---------- Section data per type ----------

const heroSlide = z.object({
  image: imageField,
  mobileImage: imageField,
  eyebrow: text(60),
  heading: text(120),
  text: text(300),
  ctaLabel: text(30),
  ctaHref: hrefField,
  cta2Label: text(30),
  cta2Href: hrefField,
  align: z.enum(["left", "center"]).default("left"),
  theme: z.enum(["dark", "light"]).default("dark"),
});

export const SECTION_DATA = {
  hero: z.object({
    slides: z.array(heroSlide).min(1, "Add at least one slide").max(6),
    autoplaySeconds: z.coerce.number().int().min(0).max(20).default(6),
    height: z.enum(["medium", "tall"]).default("medium"),
  }),
  categoryGrid: z.object({
    heading: text(80),
    subheading: text(200),
    /** Empty = all top-level categories. */
    categoryIds: z.array(objectId).max(24).default([]),
    style: z.enum(["tiles", "circles"]).default("tiles"),
  }),
  productCarousel: z
    .object({
      heading: text(80),
      subheading: text(200),
      source: z.enum(["newest", "bestselling", "discount", "collection", "category"]).default("newest"),
      refId: z.union([z.literal(""), objectId]).default(""),
      limit: z.coerce.number().int().min(2).max(24).default(8),
      layout: z.enum(["carousel", "grid"]).default("carousel"),
      showViewAll: z.boolean().default(true),
    })
    .refine((d) => (d.source === "collection" || d.source === "category" ? d.refId !== "" : true), {
      message: "Choose which collection or category to show",
      path: ["refId"],
    }),
  banner: z.object({
    image: imageField,
    mobileImage: imageField,
    heading: text(120),
    text: text(300),
    ctaLabel: text(30),
    ctaHref: hrefField,
    layout: z.enum(["full", "split"]).default("full"),
    theme: z.enum(["dark", "light"]).default("dark"),
  }),
  video: z.object({
    url: videoUrl.refine((u) => u !== "", "Upload a video or paste a YouTube link"),
    poster: imageField,
    heading: text(120),
    text: text(300),
    ctaLabel: text(30),
    ctaHref: hrefField,
  }),
  usp: z.object({
    items: z
      .array(z.object({ icon: z.enum(USP_ICONS).default("truck"), title: text(60), text: text(140) }))
      .min(1)
      .max(6),
  }),
  testimonials: z.object({
    heading: text(80),
    items: z
      .array(
        z.object({
          name: text(60).refine(Boolean, "Name is required"),
          location: text(60),
          text: text(500).refine(Boolean, "Write what they said"),
          rating: z.coerce.number().int().min(1).max(5).default(5),
          avatar: imageField,
        }),
      )
      .min(1)
      .max(12),
  }),
  faq: z.object({
    heading: text(80),
    items: z
      .array(z.object({ q: text(200).refine(Boolean, "Write the question"), a: text(1500) }))
      .min(1)
      .max(30),
  }),
  newsletter: z.object({
    heading: text(80),
    text: text(300),
    buttonLabel: text(30),
    note: text(200),
  }),
  richText: z.object({
    heading: text(120),
    body: text(5000),
    align: z.enum(["left", "center"]).default("left"),
  }),
} satisfies Record<SectionType, z.ZodType>;

export type SectionData<T extends SectionType> = z.infer<(typeof SECTION_DATA)[T]>;

const common = {
  id,
  /** Name in the builder only (never shown on the store). */
  label: text(60),
  hidden: z.boolean().default(false),
  devices: z.enum(["all", "mobile", "desktop"]).default("all"),
  startAt: whenField,
  endAt: whenField,
};

const sectionOf = <T extends SectionType>(t: T) =>
  z.object({ ...common, type: z.literal(t), data: SECTION_DATA[t] as (typeof SECTION_DATA)[T] });

export const sectionInput = z
  .discriminatedUnion("type", [
    sectionOf("hero"),
    sectionOf("categoryGrid"),
    sectionOf("productCarousel"),
    sectionOf("banner"),
    sectionOf("video"),
    sectionOf("usp"),
    sectionOf("testimonials"),
    sectionOf("faq"),
    sectionOf("newsletter"),
    sectionOf("richText"),
  ])
  .refine((s) => !s.startAt || !s.endAt || s.startAt < s.endAt, {
    message: "The end must be after the start",
    path: ["endAt"],
  });

type Common = {
  id: string;
  label: string;
  hidden: boolean;
  devices: "all" | "mobile" | "desktop";
  startAt: string | null;
  endAt: string | null;
};
export type Section = { [T in SectionType]: Common & { type: T; data: SectionData<T> } }[SectionType];
export type SectionOf<T extends SectionType> = Extract<Section, { type: T }>;

export const MAX_SECTIONS = 30;

export const sectionsInput = z
  .array(z.unknown())
  .max(MAX_SECTIONS, `A page can have up to ${MAX_SECTIONS} sections`)
  .transform((list, ctx) => {
    const out: Section[] = [];
    list.forEach((raw, i) => {
      const r = sectionInput.safeParse(raw);
      if (r.success) out.push(r.data as Section);
      else {
        const issue = r.error.issues[0];
        const name = SECTION_INFO[(raw as { type?: SectionType })?.type ?? "richText"]?.name ?? "Section";
        ctx.addIssue({ code: "custom", message: `${name} (section ${i + 1}): ${issue?.message ?? "invalid"}` });
      }
    });
    if (new Set(out.map((s) => s.id)).size !== out.length) {
      ctx.addIssue({ code: "custom", message: "Two sections have the same id" });
    }
    return out;
  });

/** Sections read back from the database: anything that no longer validates is skipped, not shown. */
export function cleanSections(raw: unknown): Section[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((s) => {
    const r = sectionInput.safeParse(s);
    return r.success ? [r.data as Section] : [];
  });
}

// ---------- New sections ----------

export function newSectionId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function emptySlide(): SectionData<"hero">["slides"][number] {
  return {
    image: { url: "", alt: "" },
    mobileImage: { url: "", alt: "" },
    eyebrow: "",
    heading: "",
    text: "",
    ctaLabel: "",
    ctaHref: "",
    cta2Label: "",
    cta2Href: "",
    align: "left",
    theme: "dark",
  };
}
export { emptySlide };

const DEFAULT_DATA: { [T in SectionType]: () => SectionData<T> } = {
  hero: () => ({
    slides: [{ ...emptySlide(), heading: "Your headline here", ctaLabel: "Shop now", ctaHref: "/search" }],
    autoplaySeconds: 6,
    height: "medium",
  }),
  categoryGrid: () => ({ heading: "Shop by category", subheading: "", categoryIds: [], style: "tiles" }),
  productCarousel: () => ({
    heading: "New arrivals",
    subheading: "",
    source: "newest",
    refId: "",
    limit: 8,
    layout: "carousel",
    showViewAll: true,
  }),
  banner: () => ({
    image: { url: "", alt: "" },
    mobileImage: { url: "", alt: "" },
    heading: "Special offer",
    text: "",
    ctaLabel: "Shop now",
    ctaHref: "/search",
    layout: "full",
    theme: "dark",
  }),
  video: () => ({ url: "", poster: { url: "", alt: "" }, heading: "", text: "", ctaLabel: "", ctaHref: "" }),
  usp: () => ({
    items: [
      { icon: "cash", title: "Cash on delivery", text: "Pay when you receive" },
      { icon: "truck", title: "All over Bangladesh", text: "Fast delivery to your door" },
      { icon: "refund", title: "Easy returns", text: "7-day return on faulty items" },
      { icon: "support", title: "Here to help", text: "Call or WhatsApp us any time" },
    ],
  }),
  testimonials: () => ({
    heading: "What our customers say",
    items: [
      {
        name: "Customer name",
        location: "Dhaka",
        text: "What they said about us.",
        rating: 5,
        avatar: { url: "", alt: "" },
      },
    ],
  }),
  faq: () => ({
    heading: "Frequently asked questions",
    items: [{ q: "How long does delivery take?", a: "Inside Dhaka 1–2 days, outside Dhaka 2–4 days." }],
  }),
  newsletter: () => ({
    heading: "Get offers first",
    text: "New arrivals and discounts, once or twice a month.",
    buttonLabel: "Subscribe",
    note: "No spam. Unsubscribe any time.",
  }),
  richText: () => ({ heading: "", body: "", align: "left" }),
};

export function newSection<T extends SectionType>(type: T, preset?: "featuredCollection"): SectionOf<T> {
  const data = DEFAULT_DATA[type]() as SectionData<T>;
  if (preset === "featuredCollection" && type === "productCarousel") {
    Object.assign(data, { heading: "Featured collection", source: "collection", layout: "grid" });
  }
  return {
    id: newSectionId(),
    type,
    label: "",
    hidden: false,
    devices: "all",
    startAt: null,
    endAt: null,
    data,
  } as SectionOf<T>;
}

/** What the home page shows before anything has been published from the builder. */
export function defaultHomeSections(): Section[] {
  const hero = newSection("hero");
  hero.data.slides[0] = {
    ...emptySlide(),
    eyebrow: "Imported from China · Delivered across Bangladesh",
    heading: "Smart gadgets for your kitchen and home.",
    text: "Cash on delivery all over the country.",
    ctaLabel: "Shop now",
    ctaHref: "/search",
  };
  // Fixed ids, so the starter layout is the same every time (the builder can tell it apart from edits).
  return [
    { ...hero, id: "home-hero" },
    { ...newSection("productCarousel"), id: "home-new-arrivals" },
    { ...newSection("usp"), id: "home-why-us" },
  ];
}

// ---------- Scheduling ----------

/** Is the section shown at `now`? (Not hidden, and inside its start/end dates.) */
export function isLive(s: Pick<Section, "hidden" | "startAt" | "endAt">, now: number): boolean {
  if (s.hidden) return false;
  if (s.startAt && Date.parse(s.startAt) > now) return false;
  if (s.endAt && Date.parse(s.endAt) <= now) return false;
  return true;
}

/** The next moment a section starts or ends (ms), so the cached page can refresh right then. */
export function nextChange(sections: Pick<Section, "hidden" | "startAt" | "endAt">[], now: number): number | null {
  let next: number | null = null;
  for (const s of sections) {
    if (s.hidden) continue;
    for (const t of [s.startAt, s.endAt]) {
      const ms = t ? Date.parse(t) : NaN;
      if (ms > now && (next === null || ms < next)) next = ms;
    }
  }
  return next;
}

export type Schedule = "live" | "scheduled" | "ended" | "hidden";

export function scheduleState(s: Pick<Section, "hidden" | "startAt" | "endAt">, now: number): Schedule {
  if (s.hidden) return "hidden";
  if (s.endAt && Date.parse(s.endAt) <= now) return "ended";
  if (s.startAt && Date.parse(s.startAt) > now) return "scheduled";
  return "live";
}

// ---------- Bangladesh time (UTC+6, no daylight saving) for the admin date inputs ----------

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

/** "2026-11-21T10:30" typed in the admin (Bangladesh time) → ISO in UTC. */
export function dhakaInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}:00+06:00`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** ISO → "2026-11-21T10:30" for a datetime-local input showing Bangladesh time. */
export function isoToDhakaInput(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms + DHAKA_OFFSET_MS).toISOString().slice(0, 16);
}

/** "21 Nov 2026, 10:30" in Bangladesh time. */
export function formatDhaka(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
