"use server";

import { env } from "@/lib/env";
import { formatTaka } from "@/lib/money";
import { logger } from "@/lib/logger";
import { normalizeBdPhone } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";
import { getSession, requestMeta } from "@/modules/auth/session";
import { cartOwnerKey, currentCartId, loadCart } from "@/modules/cart/data";
import type { CartView } from "@/modules/cart/logic";
import type { CouponTerms } from "@/modules/coupons/coupons";
import { checkCoupon } from "@/modules/coupons/data";
import { normalizeCode, OTP } from "@/modules/otp/rules";
import { checkCode, sendCode } from "@/modules/otp/service";
import { productTags, refreshTags, scopeOfProducts } from "@/modules/catalog/store-refresh";
import { rememberReceipt } from "@/modules/orders/data";
import { normalizeOrderKey } from "@/modules/orders/orders";
import { findPlacedOrder, placeOrder } from "@/modules/orders/place";
import type { CheckoutField, CheckoutTotals } from "./checkout";
import { checkCheckout } from "./data";
import { CHECKOUT_OTP_PURPOSE, isCheckoutPhoneVerified, rememberVerifiedPhone } from "./phone";

export type CheckoutResult =
  | { ok: true; orderNo: string }
  | {
      ok: false;
      error: string;
      fields?: Partial<Record<CheckoutField, string>>;
      cart?: CartView;
      needsCode?: true;
      /** The server's amounts, when they differ from what the page showed. */
      totals?: CheckoutTotals;
    };

/**
 * Places the order (FR-CO-05…07). The server checks and prices everything again, then saves the order
 * with its stock held. `key` is the page's key for this attempt, so a double click or a retry gives back
 * the same order; `expectedTotal` is the total the shopper saw, and nothing is ordered if it changed.
 */
export async function submitCheckoutAction(
  raw: unknown,
  meta: { key?: unknown; expectedTotal?: unknown } = {},
): Promise<CheckoutResult> {
  try {
    const { ip, userAgent } = await requestMeta();
    const limit = await rateLimit(redis(), `checkout:ip:${ip ?? "unknown"}`, 30, 60);
    if (!limit.allowed) return { ok: false, error: "Too many tries. Please wait a minute." };
    const key = normalizeOrderKey(meta.key);
    if (!key) return { ok: false, error: "Please reload the page and try again." };

    const owner = await cartOwnerKey(ip);
    // Sent twice (double click, or a retry after a lost reply): the first one's order, not a second.
    const done = await findPlacedOrder(owner, key);
    if (done) {
      await rememberReceipt(done.id);
      return { ok: true, orderNo: done.orderNo };
    }

    const res = await checkCheckout(raw);
    if (!res.ok) return res;
    if (typeof meta.expectedTotal === "number" && meta.expectedTotal !== res.totals.total) {
      return {
        ok: false,
        error: `The total changed to ${formatTaka(res.totals.total)}. Please check your order and place it again.`,
        totals: res.totals,
        cart: res.cart,
      };
    }

    const session = await getSession();
    const placed = await placeOrder({
      check: res,
      key,
      owner,
      cartId: await currentCartId(),
      userId: session?.user.id ?? null,
      ip,
      userAgent,
    });
    if (!placed.ok) {
      return {
        ok: false,
        error: placed.field ? "Please check the highlighted fields." : placed.error,
        fields:
          placed.field === "trxId"
            ? { trxId: "This TrxID is already on another order. Check the ID in your payment SMS." }
            : placed.field === "couponCode"
              ? { couponCode: placed.error }
              : undefined,
        cart: placed.cartChanged ? await loadCart([]) : undefined,
      };
    }
    await rememberReceipt(placed.order.id);
    if (placed.lowStockProductIds.length > 0) {
      // "Only N left" / "Sold out" changed on these product pages.
      refreshTags(await productTags(await scopeOfProducts(placed.lowStockProductIds)));
    }
    return { ok: true, orderNo: placed.order.orderNo };
  } catch (err) {
    logger.error({ err }, "order placement failed");
    return { ok: false, error: "Something went wrong and your order wasn't placed. Please try again." };
  }
}

export type CouponResponse =
  { ok: true; terms: CouponTerms; discount: number; freeDelivery: boolean } | { ok: false; error: string };

/**
 * "Apply" on the coupon field (FR-CO-04): checks the code against the saved cart and, when the phone is
 * already typed, the per-customer limit. Rate-limited so codes can't be guessed.
 */
export async function checkCouponAction(rawCode: unknown, rawPhone: unknown): Promise<CouponResponse> {
  try {
    const { ip } = await requestMeta();
    const limit = await rateLimit(redis(), `coupon:ip:${ip ?? "unknown"}`, 20, 10 * 60);
    if (!limit.allowed) return { ok: false, error: "Too many tries. Please wait a few minutes." };
    if (typeof rawCode !== "string") return { ok: false, error: "Enter a coupon code." };
    const phone = typeof rawPhone === "string" ? normalizeBdPhone(rawPhone) : null;
    const [cart, session] = await Promise.all([loadCart([]), getSession()]);
    const lines = cart.lines.filter((l) => l.problem === null);
    if (lines.length === 0) return { ok: false, error: "Your cart is empty." };
    const res = await checkCoupon({ code: rawCode, lines, phone, userId: session?.user.id ?? null, now: Date.now() });
    if (!res.ok) return res;
    return { ok: true, terms: res.terms, discount: res.result.discount, freeDelivery: res.result.freeDelivery };
  } catch (err) {
    logger.error({ err }, "coupon check failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export type SendCodeResponse =
  | { ok: true; verified: true }
  | { ok: true; verified?: false; resendIn: number; expiresIn: number }
  | { ok: false; error: string; retryAfter?: number; cooldown?: true };

/** Texts a 6-digit code to the checkout phone (FR-CO-03), unless it is already confirmed. */
export async function sendCheckoutCodeAction(rawPhone: unknown): Promise<SendCodeResponse> {
  try {
    const phone = typeof rawPhone === "string" ? normalizeBdPhone(rawPhone) : null;
    if (!phone) return { ok: false, error: "Enter a Bangladeshi mobile number, like 01712345678" };
    if (await isCheckoutPhoneVerified(phone, await getSession())) return { ok: true, verified: true };
    const { ip } = await requestMeta();
    const store = env().STORE_NAME;
    return await sendCode({
      phone,
      purpose: CHECKOUT_OTP_PURPOSE,
      ip,
      text: (code) =>
        `${code} is your ${store} order code. It expires in ${OTP.ttlSeconds / 60} minutes. Do not share it.`,
    });
  } catch (err) {
    logger.error({ err }, "checkout code send failed");
    return { ok: false, error: "We couldn't send the code just now. Please try again." };
  }
}

export type CheckCodeResponse = { ok: true } | { ok: false; error: string; expired?: boolean };

/** Checks the code; on success this browser counts the number as confirmed for an hour. */
export async function verifyCheckoutCodeAction(rawPhone: unknown, rawCode: unknown): Promise<CheckCodeResponse> {
  try {
    const phone = typeof rawPhone === "string" ? normalizeBdPhone(rawPhone) : null;
    if (!phone) return { ok: false, error: "Enter a Bangladeshi mobile number, like 01712345678" };
    const code = normalizeCode(rawCode);
    if (!code) return { ok: false, error: `Enter the ${OTP.length}-digit code from the SMS.` };
    const { ip } = await requestMeta();
    const res = await checkCode({ phone, purpose: CHECKOUT_OTP_PURPOSE, code, ip });
    if (res.ok) await rememberVerifiedPhone(phone);
    return res;
  } catch (err) {
    logger.error({ err }, "checkout code check failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
