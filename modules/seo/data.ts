import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connectMongoose } from "@/lib/db/mongo";
import { TAGS } from "@/modules/catalog/cache-tags";
import { getListingSlugs } from "@/modules/catalog/listing-data";
import { Product } from "@/modules/catalog/models";
import { getLivePageList } from "@/modules/cms/pages";
import type { SitemapData } from "./site";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

/** Everything the sitemap lists; refreshed with the catalogue and CMS pages. */
export async function getSitemapData(): Promise<SitemapData> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.catalog, TAGS.productLists, TAGS.cmsPages);
  await connectMongoose();
  const [products, categories, collections, pages] = await Promise.all([
    Product.find({ status: "active" })
      .select("slug updatedAt media")
      .sort({ publishedAt: -1 })
      .limit(45_000) // one sitemap file holds 50,000 addresses
      .lean<AnyDoc[]>(),
    getListingSlugs("category"),
    getListingSlugs("collection"),
    getLivePageList(),
  ]);
  return {
    products: products.map((p) => ({
      slug: String(p.slug),
      updatedAt: new Date(p.updatedAt).toISOString(),
      image: ((p.media ?? []) as AnyDoc[]).find((m) => m.type === "image")?.url ?? null,
    })),
    categories,
    collections,
    pages: pages.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt })),
  };
}
