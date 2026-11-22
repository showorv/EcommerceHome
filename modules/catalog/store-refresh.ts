import "server-only";
import { updateTag } from "next/cache";
import { after } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { warmPaths } from "./cache-tags";
import { productTags, scopeOfProducts } from "./product-tags";

/**
 * On-demand revalidation for catalogue changes (NFR-SC-02). Server actions call these after a change;
 * only the store pages that show the changed data are rebuilt on their next visit.
 */

export { productTags, scopeOfProducts };

/**
 * Marks the tags stale (server actions only), then, after the reply is sent, visits each affected
 * store page once. A fully cached page (product pages, the home page) hands its first visitor after a
 * change the old copy while it rebuilds; that visit is ours, so shoppers get the new page.
 */
export function refreshTags(tags: Iterable<string>) {
  const unique = [...new Set(tags)];
  for (const t of unique) updateTag(t);
  warmAfterResponse(unique);
}

/** Visits the store pages behind these tags once, after the response (also used by the revalidate endpoint). */
export function warmAfterResponse(tags: string[]) {
  const paths = warmPaths(tags);
  if (paths.length === 0) return;
  after(async () => {
    const base = env().INTERNAL_APP_URL ?? env().APP_URL;
    for (const path of paths) {
      try {
        const res = await fetch(new URL(path, base), {
          headers: { "x-store-warmup": "1" },
          signal: AbortSignal.timeout(15_000),
        });
        await res.arrayBuffer(); // read to the end so the render finishes and is stored
      } catch (err) {
        logger.warn({ err, path }, "store page warm-up failed");
        return; // the store isn't reachable from here; pages rebuild on their first real visit
      }
    }
  });
}
