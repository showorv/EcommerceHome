"use server";

import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";
import { requestMeta } from "@/modules/auth/session";
import type { CartView } from "@/modules/cart/logic";
import type { CheckoutField, CheckoutTotals } from "./checkout";
import { checkCheckout } from "./data";

export type CheckoutResult =
  | { ok: true; totals: CheckoutTotals; message: string }
  | { ok: false; error: string; fields?: Partial<Record<CheckoutField, string>>; cart?: CartView };

/**
 * Sends the checkout form. For now it checks everything on the server and answers with the amounts it
 * worked out; phone OTP (2.4), payment details (2.5) and saving the order (2.7) build on this.
 */
export async function submitCheckoutAction(raw: unknown): Promise<CheckoutResult> {
  try {
    const { ip } = await requestMeta();
    const limit = await rateLimit(redis(), `checkout:ip:${ip ?? "unknown"}`, 30, 60);
    if (!limit.allowed) return { ok: false, error: "Too many tries. Please wait a minute." };
    const res = await checkCheckout(raw);
    if (!res.ok) return res;
    return {
      ok: true,
      totals: res.totals,
      message: "Everything checks out. Placing orders online switches on very soon.",
    };
  } catch (err) {
    logger.error({ err }, "checkout check failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
