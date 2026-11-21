"use server";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { normalizeBdPhone } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";
import { getSession, requestMeta } from "@/modules/auth/session";
import type { CartView } from "@/modules/cart/logic";
import { normalizeCode, OTP } from "@/modules/otp/rules";
import { checkCode, sendCode } from "@/modules/otp/service";
import type { CheckoutField, CheckoutTotals } from "./checkout";
import { checkCheckout } from "./data";
import { CHECKOUT_OTP_PURPOSE, isCheckoutPhoneVerified, rememberVerifiedPhone } from "./phone";

export type CheckoutResult =
  | { ok: true; totals: CheckoutTotals; message: string }
  | {
      ok: false;
      error: string;
      fields?: Partial<Record<CheckoutField, string>>;
      cart?: CartView;
      needsCode?: true;
    };

/**
 * Sends the checkout form. For now it checks everything on the server (including the phone code) and
 * answers with the amounts it worked out; payment details (2.5) and saving the order (2.7) build on this.
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
