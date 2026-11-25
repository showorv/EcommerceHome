import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/crypto";

/**
 * The thank-you page's pass (SRS §2.5): a signed, expiring note of the order this browser just placed,
 * kept in an httpOnly cookie. Only that browser sees the order there; tracking by order number and
 * phone (FR-AC-07) comes with the account pages. Pure: the secret is passed in.
 */

const mac = (secret: string, body: string) =>
  createHmac("sha256", secret).update(`order-receipt:v1:${body}`).digest("base64url");

export function signReceipt(secret: string, orderId: string, expiresAt: number): string {
  const body = Buffer.from(JSON.stringify({ o: orderId, e: expiresAt })).toString("base64url");
  return `${body}.${mac(secret, body)}`;
}

/** The order id in a pass, or null if it is forged or out of date. */
export function readReceipt(secret: string, token: string | undefined, now: number): string | null {
  if (!token || token.length > 300) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined || !safeEqual(sig, mac(secret, body))) return null;
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString()) as { o?: unknown; e?: unknown };
    if (typeof v.o !== "string" || !/^[a-f0-9]{24}$/.test(v.o) || typeof v.e !== "number" || v.e <= now) return null;
    return v.o;
  } catch {
    return null;
  }
}
