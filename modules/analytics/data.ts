import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { TAGS } from "@/modules/catalog/cache-tags";
import { analyticsSettings } from "@/modules/integrations/store";
import type { TrackingIds } from "./events";

/** The public pixel IDs every store page carries (never the Conversions API key). Refreshed on save. */
export async function getTrackingIds(): Promise<TrackingIds> {
  "use cache";
  cacheTag(TAGS.analytics);
  cacheLife("days");
  const s = await analyticsSettings();
  return { metaPixelId: s.metaPixelId, ga4Id: s.ga4Id, tiktokPixelId: s.tiktokPixelId };
}
