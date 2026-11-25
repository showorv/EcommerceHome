import "server-only";
import { rateLimit } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";
import { requestMeta } from "@/modules/auth/session";

/**
 * Invoice links are public (anyone with the link), so guessing is slowed down per IP: 60 opens or
 * downloads per 10 minutes is plenty for a customer and useless for trying tokens.
 */
export const INVOICE_OPENS = { limit: 60, windowSeconds: 600 } as const;

export async function invoiceOpenAllowed(): Promise<boolean> {
  const { ip } = await requestMeta();
  const r = await rateLimit(redis(), `invoice:ip:${ip ?? "unknown"}`, INVOICE_OPENS.limit, INVOICE_OPENS.windowSeconds);
  return r.allowed;
}
