import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { robotsFor, searchIndexing } from "@/modules/seo/site";

/** /robots.txt (NFR-UX-01). Staging and local copies (SEARCH_INDEXING=off, or plain http) ask not to be indexed. */
export default function robots(): MetadataRoute.Robots {
  const { APP_URL, SEARCH_INDEXING } = env();
  return robotsFor(searchIndexing(SEARCH_INDEXING, APP_URL), APP_URL);
}
