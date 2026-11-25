import { revalidateTag } from "next/cache";
import { connection, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { isStoreTag } from "@/modules/catalog/cache-tags";
import { warmAfterResponse } from "@/modules/catalog/store-refresh";

/**
 * On-demand revalidation for work done outside a web request (NFR-SC-02): scripts and, later, the
 * worker (stock changes from orders) send the cache tags their change affects. Admin saves don't use
 * this; they refresh their tags directly in the server action.
 *
 *   POST /api/internal/revalidate   Authorization: Bearer <REVALIDATE_SECRET>   {"tags": ["product:x"]}
 *
 * Switched off (404) unless REVALIDATE_SECRET is set. The affected pages are visited once right after
 * the reply, so shoppers get the rebuilt pages.
 */

const body = z.object({ tags: z.array(z.string().max(256)).min(1).max(500) });

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: NextRequest) {
  await connection();
  const secret = env().REVALIDATE_SECRET;
  if (!secret) return json({ error: "Not found" }, 404);

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !safeEqual(token, secret)) return json({ error: "Unauthorized" }, 401);

  let parsed;
  try {
    parsed = body.safeParse(await request.json());
  } catch {
    return json({ error: 'Send JSON like {"tags": ["catalog"]}' }, 400);
  }
  if (!parsed.success) return json({ error: 'Send JSON like {"tags": ["catalog"]}' }, 400);

  const tags = [...new Set(parsed.data.tags)];
  const unknown = tags.filter((t) => !isStoreTag(t));
  if (unknown.length) return json({ error: `Unknown tags: ${unknown.slice(0, 5).join(", ")}` }, 400);

  // Expire at once (not stale-while-revalidate): the caller has just changed the data.
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  warmAfterResponse(tags);
  logger.info({ tags: tags.slice(0, 50), count: tags.length }, "store pages revalidated");
  return json({ ok: true, revalidated: tags.length });
}
