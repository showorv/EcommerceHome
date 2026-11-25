import { z } from "zod";
import { formatTaka } from "@/lib/money";
import type { AdvanceRule } from "@/modules/delivery/charge";

/**
 * Fake-order protection (SRS §2.4, FR-AD-08): the rules that ask for an advance and the risk score
 * staff see on each order. Pure and browser-safe; the history comes from orders.ts on the server.
 * Money is poisha; the admin form sends taka.
 */

// ---------- Settings (Admin → Order rules) ----------

export const RULE_ADVANCES = ["delivery", "full"] as const;
export type RuleAdvance = (typeof RULE_ADVANCES)[number];

const taka = z.coerce
  .number({ error: "Enter an amount in taka" })
  .min(0, "Must be 0 or more")
  .max(10_000_000, "Too large")
  .transform((t) => Math.round(t * 100));
const whole = (min: number, max: number) =>
  z.coerce
    .number({ error: "Enter a number" })
    .int("Use a whole number")
    .min(min, `At least ${min}`)
    .max(max, `At most ${max}`);

export const orderRulesInput = z.object({
  /** How long a pending order holds its stock (FR-CO-07). */
  reservationHours: whole(1, 24 * 14).default(24),
  /** What the rules below ask for. */
  advance: z.enum(RULE_ADVANCES).default("delivery"),
  /** Zones counted as far (e.g. Outside Dhaka): new customers there pay an advance; adds to the score. */
  farZoneIds: z
    .array(z.string().regex(/^[a-f0-9]{24}$/i))
    .max(100)
    .default([]),
  newCustomerFar: z.boolean().default(true),
  highValueOn: z.boolean().default(true),
  // prefault: the default goes through the taka → poisha transform (a plain default would skip it).
  highValueAbove: taka.prefault(3000),
  pastProblemsOn: z.boolean().default(true),
  /** Cancelled + returned orders on this phone. */
  pastProblemsAtLeast: whole(1, 50).default(1),
  highScoreOn: z.boolean().default(false),
  highScoreAtLeast: whole(10, 100).default(60),
});
export type OrderRules = z.output<typeof orderRulesInput>;

/** The rules when nothing is saved yet: the SRS default (new customers outside Dhaka, orders above ৳3,000). */
export const DEFAULT_ORDER_RULES: OrderRules = orderRulesInput.parse({});

/** Saved rules read back, with anything missing or broken replaced by the default. */
export function readOrderRules(saved: unknown): OrderRules {
  const merged = { ...DEFAULT_ORDER_RULES, ...(saved && typeof saved === "object" ? saved : {}) };
  // Saved amounts are already poisha: compare and keep them as they are.
  const r = orderRulesInput.safeParse({ ...merged, highValueAbove: Number(merged.highValueAbove) / 100 });
  return r.success ? r.data : DEFAULT_ORDER_RULES;
}

// ---------- The customer's history ----------

export type CustomerHistory = {
  /** Earlier orders on this phone (any status). */
  orders: number;
  delivered: number;
  cancelled: number;
  returned: number;
  /** Names on earlier orders. */
  names: string[];
  /** Orders from the same IP for other phones in the last hour. */
  othersFromIp: number;
  /** Staff flagged this number (Admin → Blocked numbers), with their reason. */
  flag: string | null;
};

export const NO_HISTORY: CustomerHistory = {
  orders: 0,
  delivered: 0,
  cancelled: 0,
  returned: 0,
  names: [],
  othersFromIp: 0,
  flag: null,
};

// ---------- Risk score (shown to staff) ----------

export type RiskLevel = "low" | "medium" | "high";
export const RISK_LEVEL_NAMES: Record<RiskLevel, string> = { low: "Low", medium: "Medium", high: "High" };

export type Risk = { score: number; level: RiskLevel; reasons: string[] };

const words = (name: string) =>
  new Set(
    name
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1),
  );

/** Another name is "the same person" if they share a word ("Rahim Uddin" / "Md Rahim"). */
function nameDiffers(name: string, past: string[]): boolean {
  if (past.length === 0) return false;
  const mine = words(name);
  return !past.some((p) => [...words(p)].some((w) => mine.has(w)));
}

export function riskScore(
  h: CustomerHistory,
  order: { name: string; subtotal: number; zoneId: string },
  rules: OrderRules,
): Risk {
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };
  if (h.flag !== null) add(40, h.flag ? `Flagged number: ${h.flag}` : "Flagged number");
  if (h.returned > 0) add(Math.min(50, 25 * h.returned), `${h.returned} returned order${h.returned > 1 ? "s" : ""}`);
  if (h.cancelled > 0) {
    add(Math.min(30, 10 * h.cancelled), `${h.cancelled} cancelled order${h.cancelled > 1 ? "s" : ""}`);
  }
  if (h.delivered === 0) add(20, h.orders === 0 ? "New customer" : "No delivered orders yet");
  if (rules.farZoneIds.includes(order.zoneId)) add(10, "Far zone");
  if (order.subtotal > rules.highValueAbove) add(15, `Order above ${formatTaka(rules.highValueAbove)}`);
  if (h.othersFromIp >= 2) add(20, `${h.othersFromIp} other numbers ordered from this device in the last hour`);
  if (nameDiffers(order.name, h.names)) add(10, "Name differs from past orders");
  score = Math.min(100, score);
  return { score, level: score >= 60 ? "high" : score >= 30 ? "medium" : "low", reasons };
}

// ---------- Rules that ask for an advance ----------

export type RuleKey = "pastProblems" | "highScore" | "newCustomerFar" | "highValue";

/** What the shopper reads next to the payment options. Kind words: never "you look risky". */
export function ruleMessage(rule: RuleKey, advance: RuleAdvance, rules: OrderRules): string {
  const what = advance === "full" ? "the full amount" : "the delivery charge";
  if (rule === "newCustomerFar") return `For a first order to your area, please pay ${what} in advance.`;
  if (rule === "highValue") {
    return `For orders above ${formatTaka(rules.highValueAbove)}, please pay ${what} in advance.`;
  }
  return `For this order, please pay ${what} in advance.`;
}

/** The first rule that asks this order for an advance, or null. */
export function ruleFor(
  h: CustomerHistory,
  order: { subtotal: number; zoneId: string },
  risk: Risk,
  rules: OrderRules,
): RuleKey | null {
  if (rules.pastProblemsOn && h.cancelled + h.returned >= rules.pastProblemsAtLeast) return "pastProblems";
  if (rules.highScoreOn && risk.score >= rules.highScoreAtLeast) return "highScore";
  if (rules.newCustomerFar && h.delivered === 0 && rules.farZoneIds.includes(order.zoneId)) return "newCustomerFar";
  if (rules.highValueOn && order.subtotal > rules.highValueAbove) return "highValue";
  return null;
}

const STRICTNESS: Record<AdvanceRule, number> = { none: 0, delivery: 1, full: 2 };
/** The stricter of two advance rules (a zone's own rule and the rules above). */
export const stricter = (a: AdvanceRule, b: AdvanceRule): AdvanceRule => (STRICTNESS[a] >= STRICTNESS[b] ? a : b);

export type RiskDecision = {
  risk: Risk;
  /** Advance the order needs: the zone's rule or a rule above, whichever is stricter. */
  advance: AdvanceRule;
  /** The rule that asked, and what the shopper is told. */
  rule: RuleKey | null;
  message: string | null;
  /** A rule asked for an advance, but no wallet is on: the order goes through and staff call. */
  callInstead: boolean;
};

export function decide(input: {
  history: CustomerHistory;
  order: { name: string; subtotal: number; zoneId: string };
  zoneAdvance: AdvanceRule;
  rules: OrderRules;
  walletCount: number;
}): RiskDecision {
  const { history, order, zoneAdvance, rules, walletCount } = input;
  const risk = riskScore(history, order, rules);
  const rule = ruleFor(history, order, risk, rules);
  if (!rule) return { risk, advance: zoneAdvance, rule: null, message: null, callInstead: false };
  if (walletCount === 0) {
    return {
      risk: { ...risk, reasons: [...risk.reasons, "Needs an advance by the order rules, but no wallet is on: call"] },
      advance: zoneAdvance,
      rule,
      message: null,
      callInstead: true,
    };
  }
  const advance = stricter(zoneAdvance, rules.advance);
  return {
    risk,
    advance,
    rule,
    // Only worth saying when the rule changed what the zone already asks for.
    message: advance === zoneAdvance ? null : ruleMessage(rule, rules.advance, rules),
    callInstead: false,
  };
}
