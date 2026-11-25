import { describe, expect, it } from "vitest";
import { requiredPermission } from "@/modules/auth/admin-routes";
import { blockInput } from "@/modules/customers/blocks";
import {
  decide,
  DEFAULT_ORDER_RULES,
  NO_HISTORY,
  orderRulesInput,
  readOrderRules,
  riskScore,
  ruleFor,
  stricter,
  type CustomerHistory,
  type OrderRules,
} from "@/modules/orders/risk";

const FAR = "a".repeat(24);
const NEAR = "b".repeat(24);
const rules: OrderRules = { ...DEFAULT_ORDER_RULES, farZoneIds: [FAR] };
const regular: CustomerHistory = { ...NO_HISTORY, orders: 3, delivered: 3, names: ["Rahim Uddin"] };
const small = { name: "Rahim Uddin", subtotal: 150000, zoneId: NEAR };

describe("order rules settings", () => {
  it("start with the SRS default: delivery charge first, above ৳3,000", () => {
    expect(DEFAULT_ORDER_RULES).toMatchObject({
      reservationHours: 24,
      advance: "delivery",
      newCustomerFar: true,
      highValueOn: true,
      highValueAbove: 300000,
      pastProblemsOn: true,
      pastProblemsAtLeast: 1,
      highScoreOn: false,
    });
  });

  it("take taka from the form and keep poisha", () => {
    expect(orderRulesInput.parse({ highValueAbove: "2500.5" }).highValueAbove).toBe(250050);
    expect(orderRulesInput.safeParse({ reservationHours: "0" }).success).toBe(false);
    expect(orderRulesInput.safeParse({ farZoneIds: [{ $ne: "" }] }).success).toBe(false);
  });

  it("read saved poisha back unchanged, and fall back on broken values", () => {
    const saved = orderRulesInput.parse({ highValueAbove: 5000, advance: "full" });
    expect(readOrderRules(saved)).toEqual(saved);
    expect(readOrderRules({ advance: "everything" })).toEqual(DEFAULT_ORDER_RULES);
    expect(readOrderRules(null)).toEqual(DEFAULT_ORDER_RULES);
    expect(readOrderRules({ reservationHours: 48 }).reservationHours).toBe(48);
  });
});

describe("risk score", () => {
  it("is low for a regular customer", () => {
    expect(riskScore(regular, small, rules)).toEqual({ score: 0, level: "low", reasons: [] });
  });

  it("adds up the reasons staff see", () => {
    const r = riskScore(NO_HISTORY, { name: "Karim", subtotal: 400000, zoneId: FAR }, rules);
    expect(r).toEqual({ score: 45, level: "medium", reasons: ["New customer", "Far zone", "Order above ৳3,000"] });
  });

  it("weighs flags, returns and cancellations, capped at 100", () => {
    const h: CustomerHistory = {
      ...NO_HISTORY,
      orders: 6,
      returned: 3,
      cancelled: 3,
      flag: "Fake address",
      names: ["X Y"],
    };
    const r = riskScore(h, { ...small, name: "Rahim" }, rules);
    expect(r.score).toBe(100);
    expect(r.level).toBe("high");
    expect(r.reasons).toEqual([
      "Flagged number: Fake address",
      "3 returned orders",
      "3 cancelled orders",
      "No delivered orders yet",
      "Name differs from past orders",
    ]);
  });

  it("counts other numbers from the same device, and treats a shared word as the same name", () => {
    expect(riskScore({ ...regular, othersFromIp: 2 }, { ...small, name: "Md Rahim" }, rules).reasons).toEqual([
      "2 other numbers ordered from this device in the last hour",
    ]);
  });
});

describe("rules that ask for an advance", () => {
  const score = (h: CustomerHistory, o = small) => riskScore(h, o, rules);

  it("ask a new customer in a far zone, not a returning one", () => {
    const far = { ...small, zoneId: FAR };
    expect(ruleFor(NO_HISTORY, far, score(NO_HISTORY, far), rules)).toBe("newCustomerFar");
    expect(ruleFor(regular, far, score(regular, far), rules)).toBeNull();
    expect(ruleFor(NO_HISTORY, small, score(NO_HISTORY), rules)).toBeNull();
  });

  it("ask for large orders and past problems, and each can be switched off", () => {
    const big = { ...small, subtotal: 300001 };
    expect(ruleFor(regular, big, score(regular, big), rules)).toBe("highValue");
    expect(ruleFor(regular, { ...small, subtotal: 300000 }, score(regular), rules)).toBeNull();
    const cancelled = { ...regular, cancelled: 1 };
    expect(ruleFor(cancelled, small, score(cancelled), rules)).toBe("pastProblems");
    const off = { ...rules, highValueOn: false, pastProblemsOn: false };
    expect(ruleFor(cancelled, big, score(cancelled, big), off)).toBeNull();
  });

  it("use the score only when that rule is on", () => {
    const h: CustomerHistory = { ...regular, flag: "Odd", othersFromIp: 3 };
    const r = score(h);
    expect(r.score).toBe(60);
    expect(ruleFor(h, small, r, rules)).toBeNull();
    expect(ruleFor(h, small, r, { ...rules, highScoreOn: true })).toBe("highScore");
  });

  it("keep the stricter of the zone's rule and the rules'", () => {
    expect(stricter("none", "delivery")).toBe("delivery");
    expect(stricter("full", "delivery")).toBe("full");
  });
});

describe("the checkout decision", () => {
  const base = { history: NO_HISTORY, order: { ...small, zoneId: FAR }, rules, walletCount: 1 };

  it("asks for the delivery charge with a kind message", () => {
    const d = decide({ ...base, zoneAdvance: "none" });
    expect(d).toMatchObject({
      advance: "delivery",
      rule: "newCustomerFar",
      message: "For a first order to your area, please pay the delivery charge in advance.",
      callInstead: false,
    });
  });

  it("says nothing extra when the zone already asks for as much", () => {
    expect(decide({ ...base, zoneAdvance: "full" })).toMatchObject({ advance: "full", message: null });
    const full = decide({ ...base, zoneAdvance: "delivery", rules: { ...rules, advance: "full" } });
    expect(full.advance).toBe("full");
    expect(full.message).toMatch(/the full amount/);
  });

  it("lets the order through for a call when no wallet is on", () => {
    const d = decide({ ...base, zoneAdvance: "none", walletCount: 0 });
    expect(d).toMatchObject({ advance: "none", rule: "newCustomerFar", message: null, callInstead: true });
    expect(d.risk.reasons.at(-1)).toMatch(/no wallet is on: call/);
  });

  it("leaves the zone's rule when nothing matches", () => {
    expect(decide({ ...base, history: regular, zoneAdvance: "delivery" })).toMatchObject({
      advance: "delivery",
      rule: null,
      message: null,
    });
  });
});

describe("blocked numbers", () => {
  it("store the number in one form and need a reason", () => {
    expect(blockInput.parse({ phone: "01712-345678", kind: "flag", reason: " Refused twice " })).toEqual({
      phone: "+8801712345678",
      kind: "flag",
      reason: "Refused twice",
    });
    expect(blockInput.safeParse({ phone: "12345", kind: "block", reason: "Fake" }).success).toBe(false);
    expect(blockInput.safeParse({ phone: "01712345678", kind: "ban", reason: "Fake" }).success).toBe(false);
    expect(blockInput.safeParse({ phone: "01712345678", kind: "block", reason: "x" }).success).toBe(false);
  });

  it("have their own admin pages behind the right permissions", () => {
    expect(requiredPermission("/admin/blocked-numbers")).toBe("customers.block");
    expect(requiredPermission("/admin/order-rules")).toBe("settings.manage");
  });
});
