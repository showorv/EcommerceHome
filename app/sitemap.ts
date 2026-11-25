import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { getSitemapData } from "@/modules/seo/data";
import { sitemapFor } from "@/modules/seo/site";

/** /sitemap.xml (NFR-UX-01): home, categories, collections, products (with their first picture) and CMS pages. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapFor(await getSitemapData(), env().APP_URL);
}
