import "server-only";
import { cookies } from "next/headers";
import { env, isProd } from "@/lib/env";
import type { AuthSession } from "@/modules/auth/auth";
import { readVerifiedPhone, signVerifiedPhone } from "@/modules/otp/codes";
import { OTP } from "@/modules/otp/rules";

/**
 * Whether the checkout phone is confirmed (FR-CO-03): a signed-in customer whose account has this number
 * verified skips the code; anyone else confirms it once with a code, and this browser then remembers
 * that number for an hour in a signed httpOnly cookie.
 */
export const CHECKOUT_OTP_PURPOSE = "checkout";
const COOKIE = "phone_ok";

export async function isCheckoutPhoneVerified(phone: string, session: AuthSession | null): Promise<boolean> {
  const user = session?.user as { phoneNumber?: string | null; phoneNumberVerified?: boolean | null } | undefined;
  if (user?.phoneNumberVerified && user.phoneNumber === phone) return true;
  const token = (await cookies()).get(COOKIE)?.value;
  return readVerifiedPhone(env().BETTER_AUTH_SECRET, token, CHECKOUT_OTP_PURPOSE, Date.now()) === phone;
}

export async function rememberVerifiedPhone(phone: string): Promise<void> {
  const expiresAt = Date.now() + OTP.verifiedSeconds * 1000;
  (await cookies()).set(COOKIE, signVerifiedPhone(env().BETTER_AUTH_SECRET, phone, CHECKOUT_OTP_PURPOSE, expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    maxAge: OTP.verifiedSeconds,
  });
}
