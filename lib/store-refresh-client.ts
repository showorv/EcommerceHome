import { env } from "@/lib/env";

/**
 * For scripts and the worker: asks the running store to refresh the pages behind these cache tags
 * (app/api/internal/revalidate). Returns false, without throwing, when it can't (secret not set,
 * store not running), so a script's main job never fails because of it.
 */
export async function requestStoreRefresh(tags: string[]): Promise<boolean> {
  const { APP_URL, REVALIDATE_SECRET } = env();
  if (!REVALIDATE_SECRET || tags.length === 0) return false;
  try {
    const res = await fetch(new URL("/api/internal/revalidate", APP_URL), {
      method: "POST",
      headers: { authorization: `Bearer ${REVALIDATE_SECRET}`, "content-type": "application/json" },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
