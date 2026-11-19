/**
 * Money is stored as integer poisha (৳1 = 100 poisha) everywhere. Never use floats for money.
 */
export type Poisha = number;

export function toPoisha(taka: number): Poisha {
  if (!Number.isFinite(taka)) throw new Error("Invalid amount");
  return Math.round(taka * 100);
}

export function assertPoisha(value: number): Poisha {
  if (!Number.isSafeInteger(value)) throw new Error("Money must be an integer number of poisha");
  return value;
}

/** Formats poisha for display, e.g. 145000 -> "৳1,450". Shows decimals only when needed. */
export function formatTaka(poisha: Poisha): string {
  assertPoisha(poisha);
  const negative = poisha < 0;
  const abs = Math.abs(poisha);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  const wholeStr = whole.toLocaleString("en-US");
  const body = fraction === 0 ? wholeStr : `${wholeStr}.${String(fraction).padStart(2, "0")}`;
  return `${negative ? "-" : ""}৳${body}`;
}

/** Percentage of an amount, rounded to the nearest poisha. `percent` may be fractional (1.5 = 1.5%). */
export function percentOf(poisha: Poisha, percent: number): Poisha {
  assertPoisha(poisha);
  return Math.round((poisha * percent) / 100);
}
