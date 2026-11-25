import "server-only";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { blockFor } from "@/modules/customers/data";
import type { Zone } from "@/modules/delivery/charge";
import { Setting } from "@/modules/payments/models";
import { Order } from "./models";
import {
  decide,
  DEFAULT_ORDER_RULES,
  NO_HISTORY,
  readOrderRules,
  type CustomerHistory,
  type OrderRules,
  type RiskDecision,
} from "./risk";

/** Order rules (Admin → Order rules) and the customer facts the risk score needs (SRS §2.4). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

const SETTING_ID = "orders";

/**
 * The saved rules. Before anything is saved, zones named "Outside …" count as far, which gives the SRS
 * default: new customers outside Dhaka and orders above ৳3,000 pay the delivery charge first.
 */
export async function loadOrderRules(
  zones: Pick<Zone, "id" | "name">[],
): Promise<{ rules: OrderRules; saved: boolean }> {
  await connectMongoose();
  const s = await Setting.findById(SETTING_ID).lean<AnyDoc>();
  if (s?.value && Object.keys(s.value).length > 0) return { rules: readOrderRules(s.value), saved: true };
  return {
    rules: { ...DEFAULT_ORDER_RULES, farZoneIds: zones.filter((z) => /outside/i.test(z.name)).map((z) => z.id) },
    saved: false,
  };
}

export async function saveOrderRules(rules: OrderRules, by: string): Promise<void> {
  await connectMongoose();
  await Setting.updateOne({ _id: SETTING_ID }, { $set: { value: rules, updatedBy: by } }, { upsert: true });
}

/** Earlier orders on this phone, other numbers ordering from this IP lately, and any staff flag. */
export async function customerHistory(phone: string, ip: string | null): Promise<CustomerHistory> {
  await connectMongoose();
  const [counts, names, fromIp, block] = await Promise.all([
    Order.aggregate<{ _id: string; n: number }>([
      { $match: { "customer.phone": phone } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
    Order.distinct("customer.name", { "customer.phone": phone }),
    ip
      ? Order.distinct(
          "customer.phone",
          trustFilter({ ip, createdAt: { $gte: new Date(Date.now() - 3600_000) }, "customer.phone": { $ne: phone } }),
        )
      : Promise.resolve([]),
    blockFor(phone),
  ]);
  const by = new Map(counts.map((c) => [c._id, c.n]));
  const orders = counts.reduce((n, c) => n + c.n, 0);
  return {
    ...NO_HISTORY,
    orders,
    delivered: (by.get("delivered") ?? 0) + (by.get("partially_delivered") ?? 0),
    cancelled: by.get("cancelled") ?? 0,
    returned: by.get("returned") ?? 0,
    names: (names as unknown[]).map(String).slice(0, 20),
    othersFromIp: fromIp.length,
    flag: block?.kind === "flag" ? block.reason : null,
  };
}

export type CheckoutRisk = { blocked: true } | { blocked: false; decision: RiskDecision };

/** Whether this number may order, and what advance the order needs (the zone's rule or a stricter one). */
export async function assessCheckout(input: {
  phone: string;
  name: string;
  ip: string | null;
  subtotal: number;
  zone: Zone;
  zones: Zone[];
  walletCount: number;
}): Promise<CheckoutRisk> {
  const block = await blockFor(input.phone);
  if (block?.kind === "block") return { blocked: true };
  const [history, { rules }] = await Promise.all([customerHistory(input.phone, input.ip), loadOrderRules(input.zones)]);
  return {
    blocked: false,
    decision: decide({
      history,
      order: { name: input.name, subtotal: input.subtotal, zoneId: input.zone.id },
      zoneAdvance: input.zone.advanceRule,
      rules,
      walletCount: input.walletCount,
    }),
  };
}
