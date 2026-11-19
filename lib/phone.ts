/**
 * Bangladeshi mobile numbers: 01[3-9]XXXXXXXX, stored normalised as +8801XXXXXXXXX (SRS §2.2).
 */
const LOCAL = /^01[3-9]\d{8}$/;

/** Returns the normalised +8801… form, or null if the input is not a valid BD mobile number. */
export function normalizeBdPhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, "");
  let local: string;
  if (digits.startsWith("+880")) local = "0" + digits.slice(4);
  else if (digits.startsWith("880")) local = "0" + digits.slice(3);
  else local = digits;
  return LOCAL.test(local) ? "+88" + local : null;
}

export function isBdPhone(input: string): boolean {
  return normalizeBdPhone(input) !== null;
}

/** Masks a phone for display in logs or lists: +8801712345678 -> +88017*****678 */
export function maskPhone(phone: string): string {
  if (phone.length < 8) return "***";
  return phone.slice(0, 6) + "*".repeat(phone.length - 9) + phone.slice(-3);
}
