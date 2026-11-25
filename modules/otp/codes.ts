import { createHmac, randomInt } from "node:crypto";
import { safeEqual } from "@/lib/crypto";

/**
 * Codes and "this number is confirmed" tokens. Node-only and pure: the secret is passed in, so tests
 * can run without the environment. Codes are stored only as an HMAC, tied to the number and purpose.
 */

export function newCode(length = 6): string {
  return Array.from({ length }, () => randomInt(10)).join("");
}

const mac = (secret: string, value: string) => createHmac("sha256", secret).update(value).digest("base64url");

export function hashCode(secret: string, phone: string, purpose: string, code: string): string {
  return mac(secret, `otp-code:v1:${purpose}:${phone}:${code}`);
}

/** A signed, expiring proof that `phone` passed a code check for `purpose`. Kept in an httpOnly cookie. */
export function signVerifiedPhone(secret: string, phone: string, purpose: string, expiresAt: number): string {
  const body = Buffer.from(JSON.stringify({ p: phone, u: purpose, e: expiresAt })).toString("base64url");
  return `${body}.${mac(secret, `otp-ok:v1:${body}`)}`;
}

/** The confirmed number in a token, or null if it is forged, for another purpose or out of date. */
export function readVerifiedPhone(secret: string, token: string | undefined, purpose: string, now: number) {
  if (!token || token.length > 400) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  if (!safeEqual(sig, mac(secret, `otp-ok:v1:${body}`))) return null;
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString()) as { p?: unknown; u?: unknown; e?: unknown };
    if (typeof v.p !== "string" || v.u !== purpose || typeof v.e !== "number" || v.e <= now) return null;
    return v.p;
  } catch {
    return null;
  }
}
