import "server-only";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { maskPhone } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";
import { safeEqual } from "@/lib/crypto";
import { queueMessage } from "@/modules/notifications/send";
import { hashCode, newCode } from "./codes";
import { Otp } from "./models";
import { OTP } from "./rules";

/**
 * Sends and checks phone codes (FR-CO-03, SRS §2.4, NFR-SEC-05): 6 digits, 5 minutes, 5 tries, one live
 * code per number and purpose, a minute between sends, 3 sends per number per 10 minutes and 10 per
 * IP per hour. Messages never say whether a number has an account.
 */

export type SendCodeResult =
  | { ok: true; resendIn: number; expiresIn: number }
  /** `cooldown`: a code went out under a minute ago and still works. */
  | { ok: false; error: string; retryAfter?: number; cooldown?: true };

export type CheckCodeResult = { ok: true } | { ok: false; error: string; expired?: boolean };

const secret = () => env().BETTER_AUTH_SECRET;
const wait = (s: number) => (s >= 90 ? `${Math.ceil(s / 60)} minutes` : `${s} seconds`);

export async function sendCode(input: {
  phone: string;
  purpose: string;
  ip: string | null;
  text: (code: string) => string;
}): Promise<SendCodeResult> {
  const { phone, purpose, ip } = input;
  await connectMongoose();
  const now = Date.now();

  // A code went out a moment ago: say how long to wait before burning a send from the limits.
  const live = await Otp.findOne({ phone, purpose }, { sentAt: 1 }).lean<{ sentAt: Date }>();
  const since = live ? Math.floor((now - live.sentAt.getTime()) / 1000) : Infinity;
  if (since < OTP.resendSeconds) {
    const retryAfter = OTP.resendSeconds - since;
    return { ok: false, error: "We sent you a code a moment ago. Enter it here.", retryAfter, cooldown: true };
  }

  const byIp = await rateLimit(redis(), `otp:ip:${ip ?? "unknown"}`, OTP.perIp.limit, OTP.perIp.windowSeconds);
  if (!byIp.allowed) {
    return {
      ok: false,
      error: `Too many codes asked for. Please try again in ${wait(byIp.retryAfterSeconds)}.`,
      retryAfter: byIp.retryAfterSeconds,
    };
  }
  const byPhone = await rateLimit(
    redis(),
    `otp:phone:${purpose}:${phone}`,
    OTP.perPhone.limit,
    OTP.perPhone.windowSeconds,
  );
  if (!byPhone.allowed) {
    return {
      ok: false,
      error: `Too many codes for this number. Please try again in ${wait(byPhone.retryAfterSeconds)}.`,
      retryAfter: byPhone.retryAfterSeconds,
    };
  }

  const code = newCode(OTP.length);
  try {
    // Replaces the old code only if it is past the resend wait. Two sends at once: the second one
    // finds no matching code, tries to insert and hits the unique index.
    await Otp.findOneAndUpdate(
      trustFilter({ phone, purpose, sentAt: { $lte: new Date(now - OTP.resendSeconds * 1000) } }),
      {
        $set: {
          codeHash: hashCode(secret(), phone, purpose, code),
          attempts: 0,
          sentAt: new Date(now),
          expiresAt: new Date(now + OTP.ttlSeconds * 1000),
          ip,
        },
      },
      { upsert: true },
    );
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      return {
        ok: false,
        error: "We sent you a code a moment ago. Enter it here.",
        retryAfter: OTP.resendSeconds,
        cooldown: true,
      };
    }
    throw err;
  }

  try {
    await queueMessage({ channel: "sms", purpose: `${purpose}_otp`, to: phone, text: input.text(code) });
  } catch (err) {
    await Otp.deleteOne({ phone, purpose });
    logger.error({ err, to: maskPhone(phone), purpose }, "could not queue the code SMS");
    return { ok: false, error: "We couldn't send the code just now. Please try again." };
  }
  logger.info({ to: maskPhone(phone), purpose }, "code sent");
  return { ok: true, resendIn: OTP.resendSeconds, expiresIn: OTP.ttlSeconds };
}

export async function checkCode(input: {
  phone: string;
  purpose: string;
  code: string;
  ip: string | null;
}): Promise<CheckCodeResult> {
  const { phone, purpose, code, ip } = input;
  const limit = await rateLimit(
    redis(),
    `otp-check:ip:${ip ?? "unknown"}`,
    OTP.checksPerIp.limit,
    OTP.checksPerIp.windowSeconds,
  );
  if (!limit.allowed) return { ok: false, error: `Too many tries. Please wait ${wait(limit.retryAfterSeconds)}.` };

  await connectMongoose();
  // Counts the try before comparing, in one step, so parallel guesses can't get past 5.
  const doc = await Otp.findOneAndUpdate(
    trustFilter({ phone, purpose, expiresAt: { $gt: new Date() }, attempts: { $lt: OTP.maxAttempts } }),
    { $inc: { attempts: 1 } },
    { returnDocument: "after" },
  ).lean<{ _id: unknown; codeHash: string; attempts: number }>();
  if (!doc) return { ok: false, error: "This code is no longer valid. Please ask for a new one.", expired: true };

  if (!safeEqual(doc.codeHash, hashCode(secret(), phone, purpose, code))) {
    const left = OTP.maxAttempts - doc.attempts;
    return left > 0
      ? { ok: false, error: `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` }
      : {
          ok: false,
          error: "That code isn't right, and it can't be used again. Please ask for a new one.",
          expired: true,
        };
  }
  await Otp.deleteOne({ _id: doc._id });
  return { ok: true };
}
