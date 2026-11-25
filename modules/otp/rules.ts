/**
 * Phone OTP rules (FR-CO-03, SRS §2.4, NFR-SEC-05). Browser-safe: the checkout page uses the same
 * numbers for its countdown and input.
 */
export const OTP = {
  /** Digits in a code. */
  length: 6,
  /** A code works for 5 minutes… */
  ttlSeconds: 5 * 60,
  /** …and for at most 5 tries. */
  maxAttempts: 5,
  /** Wait before another code can be sent to the same number. */
  resendSeconds: 60,
  /** Codes sent to one number: 3 per 10 minutes. */
  perPhone: { limit: 3, windowSeconds: 10 * 60 },
  /** Codes sent from one IP address: 10 per hour. */
  perIp: { limit: 10, windowSeconds: 60 * 60 },
  /** Code checks from one IP address, across all numbers: 30 per 10 minutes. */
  checksPerIp: { limit: 30, windowSeconds: 10 * 60 },
  /** A confirmed number stays confirmed for this browser for an hour (one code per checkout). */
  verifiedSeconds: 60 * 60,
} as const;

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

/**
 * The code as typed: spaces and dashes dropped, Bangla digits (০–৯) read as 0–9. Null unless it is
 * exactly 6 digits.
 */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const ascii = input.replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d))).replace(/[\s-]/g, "");
  return new RegExp(`^\\d{${OTP.length}}$`).test(ascii) ? ascii : null;
}
