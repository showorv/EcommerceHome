/**
 * Fills the shop with a demo catalogue so the storefront design can be judged with real-looking
 * content: about 38 products with photos, sub-categories, two collections and a full home page.
 * DEVELOPMENT ONLY. Everything it creates is listed in public/uploads/demo-manifest.json, and
 * `pnpm demo:remove` deletes exactly that (and puts the home page back as it was).
 *
 *   pnpm demo:seed       # needs internet once, for the photos
 *   pnpm demo:remove
 */
import "../../worker/load-env";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import mongoose, { Types } from "mongoose";
import { connectMongoose } from "@/lib/db/mongo";
import { env } from "@/lib/env";
import { requestStoreRefresh } from "@/lib/store-refresh-client";
import { TAGS } from "@/modules/catalog/cache-tags";
import { syncProductFromVariants } from "@/modules/catalog/listing-sync";
import { slugify } from "@/modules/catalog/logic";
import { Category, Collection, Product, Variant } from "@/modules/catalog/models";
import { Page } from "@/modules/storefront/models";
import { cleanSections, emptySlide, newSection, type Section } from "@/modules/storefront/sections";
import { CATEGORIES, PHOTOS, PRODUCTS, WIDE_PHOTOS, photoSource } from "./catalogue";

/** Photos go where uploaded images live, so the admin accepts them when a demo product is edited. */
export const PHOTO_DIR = path.join(process.cwd(), "public", "uploads", "images");
export const PHOTO_PREFIX = "demo-";
export const MANIFEST = path.join(process.cwd(), "public", "uploads", "demo-manifest.json");
const url = (file: string) => `/uploads/images/${PHOTO_PREFIX}${file}`;

export type Manifest = {
  createdAt: string;
  categoryIds: string[];
  productIds: string[];
  collectionIds: string[];
  /** The home page's published version before the demo, restored on removal. */
  homePublishedBefore: unknown;
  homeTouched: boolean;
  /** When the demo home page was published; removal only restores if it is still that version. */
  homeAt: string | null;
};

async function download(id: string, file: string, wide = false) {
  const dest = path.join(PHOTO_DIR, PHOTO_PREFIX + file);
  if (existsSync(dest)) return;
  const res = await fetch(photoSource(id, wide), { signal: AbortSignal.timeout(30_000) });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.startsWith("image/")) throw new Error(`Photo ${id}: ${res.status} ${type}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function downloadAll() {
  const jobs: [string, string, boolean][] = [];
  for (const [subject, ids] of Object.entries(PHOTOS))
    ids.forEach((id, i) => jobs.push([id, `${subject}-${i}.jpg`, false]));
  for (const [name, id] of Object.entries(WIDE_PHOTOS)) jobs.push([id, `wide-${name}.jpg`, true]);
  let done = 0;
  const worker = async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      await download(...job);
      done++;
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log(`Photos ready (${done}).`);
}

async function main() {
  if (env().NODE_ENV === "production") throw new Error("Demo data is for development only.");
  if (existsSync(MANIFEST)) throw new Error("Demo data is already in the shop. Run pnpm demo:remove first.");
  mkdirSync(PHOTO_DIR, { recursive: true });
  await downloadAll();
  await connectMongoose();

  const m: Manifest = {
    createdAt: new Date().toISOString(),
    categoryIds: [],
    productIds: [],
    collectionIds: [],
    homePublishedBefore: null,
    homeTouched: false,
    homeAt: null,
  };
  // Write as we go, so a failure half-way can still be cleaned up.
  const save = () => writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
  save();

  // ---- Categories ----
  const catId = new Map<string, Types.ObjectId>();
  for (const [i, c] of CATEGORIES.entries()) {
    const existing = c.existingSlug ? await Category.findOne({ slug: c.existingSlug }).lean() : null;
    if (existing) {
      catId.set(c.key, existing._id as Types.ObjectId);
      continue;
    }
    const sample = PRODUCTS.find(
      (p) => p.category === c.key || CATEGORIES.find((s) => s.key === p.category)?.parent === c.key,
    );
    const doc = await Category.create({
      name: { en: c.name, bn: c.bn },
      slug: slugify(c.name),
      parentId: c.parent ? catId.get(c.parent) : null,
      order: i,
      image: sample ? { url: url(`${sample.photos[0]}-${sample.photos[1]}.jpg`), alt: c.name } : {},
      active: true,
    });
    catId.set(c.key, doc._id);
    m.categoryIds.push(String(doc._id));
    save();
  }

  // ---- Products ----
  const start = Date.now();
  for (const [i, p] of PRODUCTS.entries()) {
    const sub = CATEGORIES.find((c) => c.key === p.category)!;
    const [subject, first] = p.photos;
    const slug = slugify(p.title);
    const product = await Product.create({
      title: { en: p.title, bn: "" },
      slug,
      status: "active",
      categoryIds: [catId.get(sub.key), ...(sub.parent ? [catId.get(sub.parent)] : [])],
      tags: ["demo", subject],
      labels: p.labels ?? [],
      shortDescription: { en: p.summary, bn: "" },
      media: [first, first + 1].map((n, k) => ({
        type: "image",
        url: url(`${subject}-${n}.jpg`),
        alt: k === 0 ? p.title : `${p.title}, another view`,
        width: 900,
        height: 900,
      })),
      optionNames: p.option ? [p.option.name] : [],
      blocks: [
        {
          type: "text",
          data: {
            heading: "Why you'll love it",
            body: `${p.summary}\nChecked by our team before it ships, with cash on delivery all over Bangladesh.`,
          },
        },
        { type: "inBox", data: { heading: "What's in the box", items: [p.title, "User guide"] } },
      ],
      specs: [
        { label: "Origin", value: "Imported from China" },
        { label: "Warranty", value: "7-day replacement" },
      ],
      ratingAvg: p.rating?.[0] ?? 0,
      ratingCount: p.rating?.[1] ?? 0,
      sortScore: p.rating?.[1] ?? 0,
      // Newest first in the order listed.
      publishedAt: new Date(start - i * 60_000),
    });
    m.productIds.push(String(product._id));
    save();

    const values = p.option?.values ?? [""];
    await Variant.insertMany(
      values.map((v, k) => {
        const extra = (p.option?.step ?? 0) * k * 100;
        return {
          productId: product._id,
          sku: `DEMO-${slug}-${k}`.slice(0, 60).toUpperCase(),
          options: p.option ? { [p.option.name]: v } : {},
          title: v,
          price: p.price * 100 + extra,
          compareAtPrice: p.compareAt ? p.compareAt * 100 + extra : 0,
          costPrice: Math.round(p.price * 60),
          weightGrams: 600,
          stock: p.stock ?? 25,
          position: k,
        };
      }),
    );
    await syncProductFromVariants(String(product._id));
  }
  console.log(`Products: ${PRODUCTS.length}.`);

  // ---- Collections ----
  const picks = PRODUCTS.flatMap((p, i) =>
    p.labels?.some((l) => l === "bestseller" || l === "hot") ? [m.productIds[i]] : [],
  );
  const editors = await Collection.create({
    name: { en: "Editor's Picks", bn: "" },
    slug: "editors-picks",
    description: { en: "Our team's favourites this month.", bn: "" },
    image: { url: url("wide-interior.jpg"), alt: "Editor's picks" },
    type: "manual",
    productIds: picks,
    sort: "manual",
  });
  const sale = await Collection.create({
    name: { en: "On Sale", bn: "" },
    slug: "on-sale",
    description: { en: "Everything with a price cut, while stock lasts.", bn: "" },
    image: { url: url("wide-living.jpg"), alt: "On sale" },
    type: "rule",
    rules: [{ field: "onSale", op: "eq", value: true }],
    sort: "newest",
  });
  m.collectionIds.push(String(editors._id), String(sale._id));
  save();

  // ---- Home page (only when nothing has been published from the builder) ----
  const home = await Page.findOne({ slug: "home" }).lean<{ published?: unknown }>();
  if (!home?.published) {
    const sections = homeSections({
      categoryIds: CATEGORIES.filter((c) => !c.parent).map((c) => String(catId.get(c.key))),
      editorsId: String(editors._id),
    });
    const at = new Date();
    m.homePublishedBefore = home?.published ?? null;
    m.homeTouched = true;
    m.homeAt = at.toISOString();
    save();
    await Page.updateOne(
      { slug: "home" },
      {
        $set: { published: { sections, at, by: null } },
        $setOnInsert: { title: "Home page", draft: { sections, at } },
      },
      { upsert: true },
    );
  } else {
    console.log("The home page is already published from the builder, so it was left as it is.");
  }

  const refreshed = await requestStoreRefresh([TAGS.catalog, TAGS.productLists, TAGS.navigation, TAGS.design]);
  console.log(`Demo shop ready.${refreshed ? "" : " Restart the dev server if the pages don't show it yet."}`);
}

function homeSections({ categoryIds, editorsId }: { categoryIds: string[]; editorsId: string }): Section[] {
  const hero = newSection("hero");
  hero.data.height = "tall";
  hero.data.slides = [
    {
      ...emptySlide(),
      image: { url: url("wide-kitchen.jpg"), alt: "A bright modern kitchen" },
      eyebrow: "New season · Kitchen",
      heading: "Cook smarter, every day.",
      text: "Pans, knives and gadgets that make home cooking easy.",
      ctaLabel: "Shop kitchen",
      ctaHref: "/c/kitchen-gadgets",
      cta2Label: "See offers",
      cta2Href: "/collections/on-sale",
    },
    {
      ...emptySlide(),
      image: { url: url("wide-living.jpg"), alt: "A calm living room" },
      eyebrow: "Home decoration",
      heading: "Make your home feel like you.",
      text: "Lamps, vases and plants, delivered across Bangladesh.",
      ctaLabel: "Shop decoration",
      ctaHref: "/c/decoration",
      cta2Label: "",
      cta2Href: "",
    },
    {
      ...emptySlide(),
      image: { url: url("wide-travel.jpg"), alt: "A traveller with a backpack" },
      eyebrow: "Bags & travel",
      heading: "Ready for the weekend.",
      text: "Backpacks and duffels built to go anywhere.",
      ctaLabel: "Shop bags",
      ctaHref: "/c/bags-and-travel",
      cta2Label: "",
      cta2Href: "",
    },
  ];

  const cats = newSection("categoryGrid");
  cats.data.categoryIds = categoryIds;

  const fresh = newSection("productCarousel");
  Object.assign(fresh.data, { heading: "New arrivals", subheading: "Just landed this week", limit: 10 });

  const editors = newSection("productCarousel");
  Object.assign(editors.data, {
    heading: "Editor's picks",
    subheading: "Our favourites this month",
    source: "collection",
    refId: editorsId,
    layout: "grid",
    limit: 8,
  });

  const banner = newSection("banner");
  Object.assign(banner.data, {
    image: { url: url("wide-interior.jpg"), alt: "Living room with plants" },
    heading: "Up to 30% off home decoration",
    text: "Lamps, vases and candles at their best prices this month.",
    ctaLabel: "Shop the sale",
    ctaHref: "/collections/on-sale",
  });

  const best = newSection("productCarousel");
  Object.assign(best.data, { heading: "Best sellers", subheading: "What everyone is buying", source: "bestselling" });

  const reviews = newSection("testimonials");
  reviews.data.items = [
    {
      name: "Nusrat J.",
      location: "Dhaka",
      text: "The backpack is even better than the photos. Delivered in one day.",
      rating: 5,
      avatar: { url: "", alt: "" },
    },
    {
      name: "Rakib H.",
      location: "Chattogram",
      text: "Paid cash on delivery, no hassle. The knife is seriously sharp.",
      rating: 5,
      avatar: { url: "", alt: "" },
    },
    {
      name: "Farhana A.",
      location: "Sylhet",
      text: "Lovely lamp, well packed. Will order again.",
      rating: 4,
      avatar: { url: "", alt: "" },
    },
  ];

  const faq = newSection("faq");
  faq.data.items = [
    { q: "How long does delivery take?", a: "Inside Dhaka 1–2 days, outside Dhaka 2–4 days." },
    {
      q: "Can I pay cash on delivery?",
      a: "Yes, all over Bangladesh. Some areas ask for the delivery charge in advance.",
    },
    { q: "What if the item is faulty?", a: "Tell us within 7 days and we replace it." },
  ];

  const sections = [
    hero,
    cats,
    fresh,
    editors,
    banner,
    best,
    newSection("usp"),
    reviews,
    faq,
    newSection("newsletter"),
  ];
  const clean = cleanSections(sections);
  if (clean.length !== sections.length) {
    const bad = sections.filter((s) => !clean.some((c) => c.id === s.id)).map((s) => s.type);
    throw new Error(`Demo home sections didn't pass validation: ${bad.join(", ")}`);
  }
  return clean;
}

if (process.argv[1]?.endsWith("seed.ts")) {
  main()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

export function readManifest(): Manifest | null {
  return existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest) : null;
}
