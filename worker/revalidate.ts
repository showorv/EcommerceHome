import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Asks the web app to rebuild the store pages behind these cache tags (POST /api/internal/revalidate).
 * Without REVALIDATE_SECRET the pages catch up on the next admin save or deploy instead.
 */
export async function revalidateStore(tags: string[]): Promise<void> {
  if (tags.length === 0) return;
  const { REVALIDATE_SECRET: secret, APP_URL, INTERNAL_APP_URL } = env();
  if (!secret) {
    logger.warn({ count: tags.length }, "REVALIDATE_SECRET not set: store pages not rebuilt after a stock change");
    return;
  }
  try {
    const res = await fetch(new URL("/api/internal/revalidate", INTERNAL_APP_URL ?? APP_URL), {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ tags: tags.slice(0, 500) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) logger.warn({ status: res.status }, "store revalidation refused");
  } catch (err) {
    logger.warn({ err }, "store revalidation failed");
  }
}
