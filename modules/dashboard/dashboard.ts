/**
 * The admin dashboard (FR-AD-01). Pure and browser-safe: periods in Dhaka time and the rates, so the
 * numbers mean the same thing everywhere they are shown.
 */

export const PERIODS = ["today", "7d", "30d"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_NAMES: Record<Period, string> = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days" };
const PERIOD_DAYS: Record<Period, number> = { today: 1, "7d": 7, "30d": 30 };

export function readPeriod(v: string | string[] | undefined): Period {
  const p = (Array.isArray(v) ? v[0] : v) as Period;
  return PERIODS.includes(p) ? p : "today";
}

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000; // UTC+6, no daylight saving

/** Start of the period: Dhaka midnight today, or that many days back including today. */
export function periodStart(period: Period, now: number): Date {
  const local = now + DHAKA_OFFSET_MS;
  const midnight = local - (((local % 86_400_000) + 86_400_000) % 86_400_000);
  return new Date(midnight - DHAKA_OFFSET_MS - (PERIOD_DAYS[period] - 1) * 86_400_000);
}

export type Rate = { part: number; of: number; rate: number | null };
export const rate = (part: number, of: number): Rate => ({ part, of, rate: of > 0 ? part / of : null });

export type OrderCounts = {
  /** Orders placed in the period. */
  placed: number;
  /** Their total, cancelled orders left out (poisha). */
  value: number;
  /** Of those placed, how many staff have decided on (no longer pending or on hold)… */
  decided: number;
  /** …and how many of those were confirmed (even if cancelled later). */
  confirmed: number;
};

export type Outcomes = {
  /** Orders that reached their end at the door in the period. */
  delivered: number;
  partial: number;
  returned: number;
  /** What delivered and partly delivered orders brought in, less refunds (poisha). */
  deliveredValue: number;
};

export type Rates = { confirmation: Rate; deliverySuccess: Rate; rto: Rate };

/**
 * Confirmation rate: confirmed ÷ decided, for orders placed in the period.
 * Delivery success and RTO (return to origin): of the orders that reached the door in the period,
 * how many were kept (fully or in part) and how many came back. The two add up to 100%.
 */
export function dashboardRates(c: OrderCounts, o: Outcomes): Rates {
  const reached = o.delivered + o.partial + o.returned;
  return {
    confirmation: rate(c.confirmed, c.decided),
    deliverySuccess: rate(o.delivered + o.partial, reached),
    rto: rate(o.returned, reached),
  };
}

/** "86%" or "—". */
export const ratePercent = (r: Rate) => (r.rate === null ? "—" : `${Math.round(r.rate * 100)}%`);
