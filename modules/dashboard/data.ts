import "server-only";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { listInventory, type InventoryRow } from "@/modules/catalog/inventory";
import { Order } from "@/modules/orders/models";
import type { OrderStatus, PaymentStatus } from "@/modules/orders/orders";
import type { RiskLevel } from "@/modules/orders/risk";
import { CALL_OUTCOME_NAMES, type CallOutcome } from "@/modules/orders/staff";
import type { OrderCounts, Outcomes } from "./dashboard";

/** Numbers for the admin dashboard (FR-AD-01). The page decides who sees which (see the page). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

const DONE_AT_DOOR: OrderStatus[] = ["delivered", "partially_delivered", "returned"];

/** Orders placed since `from`: how many, their value, and how many staff confirmed. */
export async function orderCounts(from: Date): Promise<OrderCounts> {
  await connectMongoose();
  const [r] = await Order.aggregate<OrderCounts>([
    { $match: { createdAt: { $gte: from } } },
    {
      $group: {
        _id: null,
        placed: { $sum: 1 },
        value: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 0, "$total"] } },
        decided: { $sum: { $cond: [{ $in: ["$status", ["pending", "on_hold"]] }, 0, 1] } },
        confirmed: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$confirmedAt", null] }, null] }, 1, 0] } },
      },
    },
  ]);
  return { placed: r?.placed ?? 0, value: r?.value ?? 0, decided: r?.decided ?? 0, confirmed: r?.confirmed ?? 0 };
}

/** Orders that ended at the door since `from` (delivered, partly delivered or returned then). */
export async function outcomes(from: Date): Promise<Outcomes> {
  await connectMongoose();
  const rows = await Order.aggregate<{ _id: OrderStatus; n: number; value: number }>([
    {
      $match: {
        status: { $in: DONE_AT_DOOR },
        statusHistory: { $elemMatch: { status: { $in: DONE_AT_DOOR }, at: { $gte: from } } },
      },
    },
    {
      $group: {
        _id: "$status",
        n: { $sum: 1 },
        value: { $sum: { $subtract: ["$total", { $ifNull: ["$refund.amount", 0] }] } },
      },
    },
  ]);
  const get = (s: OrderStatus) => rows.find((r) => r._id === s);
  return {
    delivered: get("delivered")?.n ?? 0,
    partial: get("partially_delivered")?.n ?? 0,
    returned: get("returned")?.n ?? 0,
    deliveredValue: (get("delivered")?.value ?? 0) + (get("partially_delivered")?.value ?? 0),
  };
}

export type TopProduct = {
  productId: string;
  title: string;
  slug: string;
  units: number;
  value: number;
  orders: number;
};

/** Best sellers by units in orders placed since `from` (cancelled orders left out). */
export async function topProducts(from: Date, limit = 5): Promise<TopProduct[]> {
  await connectMongoose();
  const rows = await Order.aggregate<AnyDoc>([
    { $match: { createdAt: { $gte: from }, status: { $ne: "cancelled" } } },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.productId",
        title: { $last: "$items.title" },
        slug: { $last: "$items.slug" },
        units: { $sum: "$items.qty" },
        value: { $sum: { $multiply: ["$items.qty", "$items.price"] } },
        orders: { $addToSet: "$_id" },
      },
    },
    { $sort: { units: -1, value: -1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({
    productId: String(r._id),
    title: String(r.title),
    slug: String(r.slug ?? ""),
    units: r.units,
    value: r.value,
    orders: r.orders.length,
  }));
}

export async function lowStock(limit = 8): Promise<{ rows: InventoryRow[]; total: number }> {
  const all = await listInventory({ lowOnly: true });
  return { rows: all.slice(0, limit), total: all.length };
}

export type WaitingOrder = {
  orderNo: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  name: string;
  total: number;
  riskLevel: RiskLevel;
  riskScore: number;
  createdAt: string;
  calls: number;
  lastCall: string | null;
};

/** Orders still waiting for a call (pending or on hold), oldest first. */
export async function waitingForCall(limit = 8): Promise<{ rows: WaitingOrder[]; total: number }> {
  await connectMongoose();
  const filter = trustFilter({ status: { $in: ["pending", "on_hold"] } });
  const [docs, total] = await Promise.all([
    Order.find(filter)
      .select("orderNo status paymentStatus customer.name total riskLevel riskScore createdAt callLog")
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean<AnyDoc[]>(),
    Order.countDocuments(filter),
  ]);
  return {
    total,
    rows: docs.map((d) => {
      const calls = (d.callLog ?? []) as { outcome: CallOutcome }[];
      const last = calls.at(-1);
      return {
        orderNo: String(d.orderNo),
        status: d.status,
        paymentStatus: d.paymentStatus,
        name: String(d.customer?.name ?? ""),
        total: Number(d.total),
        riskLevel: (d.riskLevel ?? "low") as RiskLevel,
        riskScore: Number(d.riskScore ?? 0),
        createdAt: new Date(d.createdAt).toISOString(),
        calls: calls.length,
        lastCall: last ? (CALL_OUTCOME_NAMES[last.outcome] ?? last.outcome) : null,
      };
    }),
  };
}
