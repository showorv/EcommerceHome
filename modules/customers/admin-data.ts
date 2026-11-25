import "server-only";
import mongoose from "mongoose";
import { connectMongoose, mongoDb } from "@/lib/db/mongo";
import { Order } from "@/modules/orders/models";
import type { OrderStatus, PaymentStatus } from "@/modules/orders/orders";
import type { BlockedContact as BlockRow, BlockKind } from "./blocks";
import { BlockedContact } from "./models";
import {
  CUSTOMERS_PER_PAGE,
  customerSearch,
  KEPT_STATUSES,
  OPEN_STATUSES,
  statsFromOrders,
  type CustomerFilters,
  type CustomerStats,
} from "./stats";

/**
 * Customers for the admin (FR-AD-06): one row per mobile number, worked out from the orders. Callers
 * check customers.view; blocking goes through customers/actions.ts (customers.block).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);

export type CustomerRow = CustomerStats & {
  phone: string;
  name: string;
  otherNames: number;
  block: BlockKind | null;
  hasAccount: boolean;
};

export type CustomerList = {
  rows: CustomerRow[];
  total: number;
  pageCount: number;
  totals: { customers: number; repeat: number; accounts: number };
};

const countIf = (cond: unknown) => ({ $sum: { $cond: [cond, 1, 0] } });
const statusIn = (list: readonly string[]) => ({ $in: ["$status", list] });

export async function listCustomers(f: CustomerFilters): Promise<CustomerList> {
  await connectMongoose();
  const search = customerSearch(f.q);
  const pipeline: mongoose.PipelineStage[] = [
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: "$customer.phone",
        name: { $last: "$customer.name" },
        names: { $addToSet: "$customer.name" },
        userIds: { $addToSet: "$userId" },
        orders: { $sum: 1 },
        open: countIf(statusIn(OPEN_STATUSES)),
        delivered: countIf({ $eq: ["$status", "delivered"] }),
        partial: countIf({ $eq: ["$status", "partially_delivered"] }),
        cancelled: countIf({ $eq: ["$status", "cancelled"] }),
        returned: countIf({ $eq: ["$status", "returned"] }),
        value: {
          $sum: {
            $cond: [statusIn(KEPT_STATUSES), { $subtract: ["$total", { $ifNull: ["$refund.amount", 0] }] }, 0],
          },
        },
        firstOrderAt: { $first: "$createdAt" },
        lastOrderAt: { $last: "$createdAt" },
      },
    },
  ];
  if (search && "phone" in search) pipeline.push({ $match: { _id: { $regex: search.phone } } });
  if (search && "name" in search) pipeline.push({ $match: { names: { $regex: search.name, $options: "i" } } });
  pipeline.push(
    { $lookup: { from: "blockedContacts", localField: "_id", foreignField: "phone", as: "block" } },
    {
      $lookup: {
        from: "users",
        let: { phone: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $and: [{ $eq: ["$phoneNumber", "$$phone"] }, { $eq: ["$phoneNumberVerified", true] }] },
            },
          },
          { $project: { _id: 1 } },
        ],
        as: "account",
      },
    },
  );
  if (f.show === "repeat") pipeline.push({ $match: { orders: { $gte: 2 } } });
  if (f.show === "returns") pipeline.push({ $match: { returned: { $gt: 0 } } });
  if (f.show === "listed") pipeline.push({ $match: { "block.0": { $exists: true } } });
  const sort: Record<CustomerFilters["sort"], Record<string, 1 | -1>> = {
    recent: { lastOrderAt: -1 },
    value: { value: -1, lastOrderAt: -1 },
    orders: { orders: -1, lastOrderAt: -1 },
    returns: { returned: -1, lastOrderAt: -1 },
  };
  pipeline.push({
    $facet: {
      rows: [
        { $sort: { ...sort[f.sort], _id: 1 } },
        { $skip: (f.page - 1) * CUSTOMERS_PER_PAGE },
        { $limit: CUSTOMERS_PER_PAGE },
      ],
      count: [{ $count: "n" }],
    },
  });

  const [[res], everyone, accounts] = await Promise.all([
    Order.aggregate<{ rows: AnyDoc[]; count: { n: number }[] }>(pipeline),
    Order.aggregate<{ customers: number; repeat: number }>([
      { $group: { _id: "$customer.phone", n: { $sum: 1 } } },
      { $group: { _id: null, customers: { $sum: 1 }, repeat: { $sum: { $cond: [{ $gte: ["$n", 2] }, 1, 0] } } } },
    ]),
    mongoDb().collection("users").countDocuments({ role: "customer" }),
  ]);
  const total = res?.count[0]?.n ?? 0;
  return {
    rows: (res?.rows ?? []).map((d) => ({
      phone: String(d._id),
      name: String(d.name ?? ""),
      otherNames: Math.max(0, (d.names?.length ?? 1) - 1),
      orders: d.orders,
      open: d.open,
      delivered: d.delivered,
      partial: d.partial,
      cancelled: d.cancelled,
      returned: d.returned,
      value: d.value,
      firstOrderAt: iso(d.firstOrderAt),
      lastOrderAt: iso(d.lastOrderAt),
      block: (d.block?.[0]?.kind as BlockKind | undefined) ?? null,
      hasAccount: (d.account?.length ?? 0) > 0 || (d.userIds ?? []).some((u: unknown) => typeof u === "string"),
    })),
    total,
    pageCount: Math.max(1, Math.ceil(total / CUSTOMERS_PER_PAGE)),
    totals: { customers: everyone[0]?.customers ?? 0, repeat: everyone[0]?.repeat ?? 0, accounts },
  };
}

// ---------- One customer ----------

export type CustomerOrderRow = {
  orderNo: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  total: number;
  itemCount: number;
  firstItem: string;
  name: string;
  place: string;
  createdAt: string;
};

export type CustomerAccount = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  phoneMatches: boolean;
  createdAt: string | null;
};

export type CustomerProfile = {
  phone: string;
  stats: CustomerStats;
  names: { name: string; orders: number }[];
  emails: string[];
  places: { place: string; orders: number }[];
  accounts: CustomerAccount[];
  block: BlockRow | null;
  orders: CustomerOrderRow[];
};

export const CUSTOMER_ORDERS_SHOWN = 200;

export async function getCustomer(phone: string): Promise<CustomerProfile | null> {
  await connectMongoose();
  const docs = await Order.find({ "customer.phone": phone })
    .select("orderNo status paymentStatus total refund items customer shippingAddress userId createdAt")
    .sort({ createdAt: -1 })
    .lean<AnyDoc[]>();
  const [blockDoc, accounts] = await Promise.all([
    BlockedContact.findOne({ phone }).lean<AnyDoc>(),
    accountsFor(phone, docs),
  ]);
  if (docs.length === 0 && !blockDoc && accounts.length === 0) return null;

  const tally = (values: string[]) => {
    const m = new Map<string, number>();
    for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const placeOf = (d: AnyDoc) => [d.shippingAddress?.area, d.shippingAddress?.district].filter(Boolean).join(", ");

  return {
    phone,
    stats: statsFromOrders(
      docs.map((d) => ({ status: d.status, total: d.total, refund: d.refund, createdAt: d.createdAt })),
    ),
    names: tally(docs.map((d) => String(d.customer?.name ?? "").trim())).map(([name, orders]) => ({ name, orders })),
    emails: tally(
      docs.map((d) =>
        String(d.customer?.email ?? "")
          .trim()
          .toLowerCase(),
      ),
    ).map(([e]) => e),
    places: tally(docs.map(placeOf)).map(([place, orders]) => ({ place, orders })),
    accounts,
    block: blockDoc
      ? {
          id: String(blockDoc._id),
          phone: String(blockDoc.phone),
          kind: blockDoc.kind as BlockKind,
          reason: String(blockDoc.reason ?? ""),
          byName: String(blockDoc.byName ?? ""),
          createdAt: new Date(blockDoc.createdAt).toISOString(),
        }
      : null,
    orders: docs.slice(0, CUSTOMER_ORDERS_SHOWN).map((d) => {
      const items = (d.items ?? []) as { title: string; qty: number }[];
      return {
        orderNo: String(d.orderNo),
        status: d.status,
        paymentStatus: d.paymentStatus,
        total: Number(d.total),
        itemCount: items.reduce((n, i) => n + i.qty, 0),
        firstItem: items[0] ? `${items[0].title}${items.length > 1 ? ` + ${items.length - 1} more` : ""}` : "",
        name: String(d.customer?.name ?? ""),
        place: placeOf(d),
        createdAt: new Date(d.createdAt).toISOString(),
      };
    }),
  };
}

/** Accounts tied to this number: the one that confirmed it, and any that ordered with it while signed in. */
async function accountsFor(phone: string, orders: AnyDoc[]): Promise<CustomerAccount[]> {
  const ids = [...new Set(orders.map((o) => o.userId).filter((u): u is string => typeof u === "string"))]
    .filter((u) => mongoose.isValidObjectId(u))
    .map((u) => new mongoose.Types.ObjectId(u));
  const users = await mongoDb()
    .collection("users")
    .find(
      { $or: [{ phoneNumber: phone, phoneNumberVerified: true }, { _id: { $in: ids } }] },
      {
        projection: { name: 1, email: 1, emailVerified: 1, phoneNumber: 1, phoneNumberVerified: 1, createdAt: 1 },
      },
    )
    .limit(10)
    .toArray();
  return users.map((u) => ({
    id: String(u._id),
    name: String(u.name ?? ""),
    email: String(u.email ?? ""),
    emailVerified: Boolean(u.emailVerified),
    phoneMatches: u.phoneNumber === phone && u.phoneNumberVerified === true,
    createdAt: iso(u.createdAt),
  }));
}
