import "server-only";
import { connection } from "next/server";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { variantFacts } from "@/modules/cart/data";
import { Product, Variant } from "@/modules/catalog/models";
import { blockFor } from "@/modules/customers/data";
import type { BlockKind } from "@/modules/customers/blocks";
import { Order } from "./models";
import { ORDER_STATUSES, readSource, type OrderStatus } from "./orders";
import {
  ORDER_TABS,
  TAB_STATUSES,
  dhakaDayStart,
  type AdminOrder,
  type CallOutcome,
  type OrderFilters,
  type OrderRow,
  type OrderTab,
} from "./staff";

/** What the admin orders pages read (FR-AD-05). Callers check orders.view. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function toAdminOrder(d: AnyDoc): AdminOrder {
  const a = d.shippingAddress ?? {};
  return {
    id: String(d._id),
    orderNo: String(d.orderNo),
    rev: Number(d.rev ?? 0),
    status: d.status,
    paymentStatus: d.paymentStatus,
    createdAt: iso(d.createdAt)!,
    customer: {
      name: String(d.customer?.name ?? ""),
      phone: String(d.customer?.phone ?? ""),
      email: String(d.customer?.email ?? ""),
    },
    address: {
      districtId: String(a.districtId ?? ""),
      district: String(a.district ?? ""),
      areaId: String(a.areaId ?? ""),
      area: String(a.area ?? ""),
      line: String(a.line ?? ""),
      note: String(a.note ?? ""),
    },
    zoneId: String(d.zoneId ?? ""),
    zoneName: String(d.zoneName ?? ""),
    items: ((d.items ?? []) as AnyDoc[]).map((i) => ({
      productId: String(i.productId),
      variantId: String(i.variantId),
      title: String(i.title),
      variantTitle: String(i.variantTitle ?? ""),
      sku: String(i.sku),
      slug: String(i.slug ?? ""),
      image: i.image ? String(i.image) : null,
      price: Number(i.price),
      cost: Number(i.cost ?? 0),
      qty: Number(i.qty),
      weightGrams: Number(i.weightGrams ?? 0),
    })),
    subtotal: Number(d.subtotal),
    discount: Number(d.discount ?? 0),
    couponCode: d.couponCode ?? null,
    deliveryCharge: Number(d.deliveryCharge ?? 0),
    codFee: Number(d.codFee ?? 0),
    total: Number(d.total),
    codAmount: Number(d.codAmount),
    paymentMethod: d.paymentMethod,
    advance: d.advance
      ? {
          method: d.advance.method,
          senderNumber: String(d.advance.senderNumber ?? ""),
          trxId: String(d.advance.trxId ?? ""),
          amount: Number(d.advance.amount ?? 0),
          status: d.advance.status === "verified" || d.advance.status === "not_found" ? d.advance.status : "pending",
          verifiedByName: String(d.advance.verifiedByName ?? ""),
          verifiedAt: iso(d.advance.verifiedAt),
        }
      : null,
    reservation: {
      active: d.reservation?.active === true,
      until: iso(d.reservation?.until) ?? iso(d.createdAt)!,
      releasedAt: iso(d.reservation?.releasedAt),
    },
    risk: {
      score: Number(d.riskScore ?? 0),
      level: d.riskLevel === "high" || d.riskLevel === "medium" ? d.riskLevel : "low",
      reasons: ((d.riskReasons ?? []) as unknown[]).map(String),
    },
    statusHistory: ((d.statusHistory ?? []) as AnyDoc[]).map((h) => ({
      status: h.status,
      at: iso(h.at)!,
      byName: String(h.byName ?? (h.by ? "Staff" : "")),
      note: String(h.note ?? ""),
    })),
    callLog: ((d.callLog ?? []) as AnyDoc[]).map((c) => ({
      outcome: c.outcome as CallOutcome,
      note: String(c.note ?? ""),
      at: iso(c.at)!,
      byName: String(c.byName ?? ""),
    })),
    notes: ((d.notes ?? []) as AnyDoc[]).map((n) => ({
      text: String(n.text),
      at: iso(n.at)!,
      byName: String(n.byName ?? ""),
    })),
    edits: ((d.edits ?? []) as AnyDoc[]).map((e) => ({
      at: iso(e.at)!,
      byName: String(e.byName ?? ""),
      changes: ((e.changes ?? []) as unknown[]).map(String),
      reason: String(e.reason ?? ""),
    })),
    cancelReason: String(d.cancelReason ?? ""),
    codCollected: Number(d.codCollected ?? 0),
    returnedItems: ((d.returnedItems ?? []) as AnyDoc[]).map((r) => ({
      variantId: String(r.variantId),
      qty: Number(r.qty),
    })),
    returnReason: String(d.returnReason ?? ""),
    refund: d.refund
      ? {
          amount: Number(d.refund.amount ?? 0),
          note: String(d.refund.note ?? ""),
          at: iso(d.refund.at)!,
          byName: String(d.refund.byName ?? ""),
        }
      : null,
    paymentHistory: ((d.paymentHistory ?? []) as AnyDoc[]).map((h) => ({
      status: h.status,
      at: iso(h.at)!,
      byName: String(h.byName ?? ""),
      note: String(h.note ?? ""),
    })),
    ip: d.ip ?? null,
    source: readSource(d.source),
  };
}

function toRow(d: AnyDoc): OrderRow {
  const calls = (d.callLog ?? []) as AnyDoc[];
  const last = calls.at(-1);
  return {
    id: String(d._id),
    orderNo: String(d.orderNo),
    status: d.status,
    paymentStatus: d.paymentStatus,
    createdAt: iso(d.createdAt)!,
    name: String(d.customer?.name ?? ""),
    phone: String(d.customer?.phone ?? ""),
    area: [d.shippingAddress?.area, d.shippingAddress?.district].filter(Boolean).join(", "),
    zoneName: String(d.zoneName ?? ""),
    itemCount: ((d.items ?? []) as AnyDoc[]).reduce((n, i) => n + Number(i.qty), 0),
    total: Number(d.total),
    paymentMethod: d.paymentMethod,
    advanceToCheck: d.advance?.status === "pending",
    riskLevel: d.riskLevel === "high" || d.riskLevel === "medium" ? d.riskLevel : "low",
    riskScore: Number(d.riskScore ?? 0),
    lastCall: last ? { outcome: last.outcome, at: iso(last.at)! } : null,
    holdActive: d.reservation?.active === true,
    source: readSource(d.source),
  };
}

/** The status part of a tab's filter. */
const tabFilter = (tab: OrderTab) => {
  if (tab === "all") return {};
  const statuses = TAB_STATUSES[tab];
  return { status: statuses.length === 1 ? statuses[0] : { $in: statuses } };
};

/** Everything but the tab: search, zone, payment, dates. Built only from checked values. */
function baseFilter(f: Omit<OrderFilters, "tab" | "page">): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (f.zoneId) filter.zoneId = f.zoneId;
  if (f.payment) filter.paymentStatus = f.payment;
  if (f.from || f.to) {
    const range: Record<string, Date> = {};
    if (f.from) range.$gte = dhakaDayStart(f.from);
    if (f.to) range.$lt = new Date(dhakaDayStart(f.to).getTime() + 86_400_000);
    filter.createdAt = range;
  }
  const q = f.q.trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    if (/^sr\d+$/i.test(q)) filter.orderNo = { $regex: new RegExp(`^${escape(q.toUpperCase())}`) };
    else if (digits.length >= 4 && digits.length === q.replace(/[\s+-]/g, "").length) {
      // Phone numbers are stored as +8801…: match the digits typed, with or without the leading 0.
      filter["customer.phone"] = { $regex: new RegExp(escape(digits.replace(/^(?:88)?0?/, ""))) };
    } else filter["customer.name"] = { $regex: new RegExp(escape(q), "i") };
  }
  return filter;
}

const PAGE_SIZE = 50;

export async function listOrders(f: OrderFilters): Promise<{
  rows: OrderRow[];
  total: number;
  pageCount: number;
  counts: Record<OrderTab, number>;
}> {
  await connectMongoose();
  const base = baseFilter(f);
  const filter = { ...base, ...tabFilter(f.tab) };
  // Work queues (to call, to pack, to ship, on the way) are oldest first: who has waited longest.
  // Finished orders and "All" are newest first.
  const queue = f.tab !== "all" && f.tab !== "delivered" && f.tab !== "returned" && f.tab !== "cancelled";
  const sort = { createdAt: queue ? (1 as const) : (-1 as const) };
  const [docs, total, byStatus] = await Promise.all([
    Order.find(trustFilter(filter))
      .select(
        "orderNo status paymentStatus createdAt customer shippingAddress.area shippingAddress.district zoneName items.qty total paymentMethod advance.status riskLevel riskScore callLog reservation.active source",
      )
      .sort(sort)
      .skip((f.page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean<AnyDoc[]>(),
    Order.countDocuments(trustFilter(filter)),
    Order.aggregate<{ _id: string; n: number }>([
      { $match: trustFilter(base) },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
  ]);
  const by = new Map(byStatus.map((s) => [s._id, s.n]));
  const counts = Object.fromEntries(
    ORDER_TABS.map((t) => [
      t,
      t === "all" ? byStatus.reduce((n, s) => n + s.n, 0) : TAB_STATUSES[t].reduce((n, s) => n + (by.get(s) ?? 0), 0),
    ]),
  ) as Record<OrderTab, number>;
  return { rows: docs.map(toRow), total, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), counts };
}

/** Orders matching the filters, for the CSV export (newest first, at most `limit`). */
export async function ordersForExport(f: OrderFilters, limit = 5000): Promise<AdminOrder[]> {
  await connectMongoose();
  const base = baseFilter(f);
  const filter = { ...base, ...tabFilter(f.tab) };
  const docs = await Order.find(trustFilter(filter)).sort({ createdAt: -1 }).limit(limit).lean<AnyDoc[]>();
  return docs.map(toAdminOrder);
}

/** The time this request is served (for "waiting 3 h"): at request time, never at build time. */
export async function requestTime(): Promise<number> {
  await connection();
  return Date.now();
}

/** Orders still waiting for a staff call (the menu badge). */
export async function pendingOrderCount(): Promise<number> {
  await connectMongoose();
  return Order.countDocuments({ status: "pending" });
}

export async function getAdminOrder(orderNo: string): Promise<AdminOrder | null> {
  await connectMongoose();
  const d = await Order.findOne({ orderNo }).lean<AnyDoc>();
  return d ? toAdminOrder(d) : null;
}

export type PhoneSummary = {
  /** Other orders on this number, by status. */
  orders: number;
  byStatus: Partial<Record<OrderStatus, number>>;
  recent: { orderNo: string; status: OrderStatus; total: number; createdAt: string }[];
  block: { kind: BlockKind; reason: string } | null;
};

/** The customer's other orders on this number and any staff flag, shown beside the order. */
export async function phoneSummary(phone: string, exceptOrderNo: string): Promise<PhoneSummary> {
  await connectMongoose();
  const match = trustFilter({ "customer.phone": phone, orderNo: { $ne: exceptOrderNo } });
  const [counts, recent, block] = await Promise.all([
    Order.aggregate<{ _id: OrderStatus; n: number }>([
      { $match: match },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
    Order.find(match).select("orderNo status total createdAt").sort({ createdAt: -1 }).limit(5).lean<AnyDoc[]>(),
    blockFor(phone),
  ]);
  const byStatus: PhoneSummary["byStatus"] = {};
  for (const c of counts) if ((ORDER_STATUSES as readonly string[]).includes(c._id)) byStatus[c._id] = c.n;
  return {
    orders: counts.reduce((n, c) => n + c.n, 0),
    byStatus,
    recent: recent.map((r) => ({
      orderNo: String(r.orderNo),
      status: r.status,
      total: Number(r.total),
      createdAt: iso(r.createdAt)!,
    })),
    block,
  };
}

export type VariantOption = {
  variantId: string;
  productId: string;
  title: string;
  variantTitle: string;
  sku: string;
  price: number;
  available: number;
  weightGrams: number;
  image: string | null;
};

/** Variants to add to an order: by product title or SKU, active products only. */
export async function searchVariants(q: string): Promise<VariantOption[]> {
  await connectMongoose();
  const text = q.trim().slice(0, 60);
  if (text.length < 2) return [];
  const rx = new RegExp(escape(text), "i");
  const [bySku, byTitle] = await Promise.all([
    Variant.find(trustFilter({ sku: { $regex: rx }, active: true }))
      .select("_id")
      .limit(20)
      .lean<AnyDoc[]>(),
    Product.find(
      trustFilter({ status: "active", $or: [{ "title.en": { $regex: rx } }, { "title.bn": { $regex: rx } }] }),
    )
      .select("_id")
      .limit(10)
      .lean<AnyDoc[]>(),
  ]);
  const fromProducts = byTitle.length
    ? await Variant.find(trustFilter({ productId: { $in: byTitle.map((p) => p._id) }, active: true }))
        .select("_id")
        .limit(30)
        .lean<AnyDoc[]>()
    : [];
  const ids = [...new Set([...bySku, ...fromProducts].map((v) => String(v._id)))].slice(0, 30);
  const [facts, skus] = await Promise.all([
    variantFacts(ids),
    Variant.find(trustFilter({ _id: { $in: ids } }))
      .select("sku")
      .lean<AnyDoc[]>(),
  ]);
  const sku = new Map(skus.map((v) => [String(v._id), String(v.sku)]));
  return ids
    .map((id) => ({ id, f: facts.get(id) }))
    .filter((x): x is { id: string; f: NonNullable<typeof x.f> } => !!x.f && x.f.sellable)
    .map(({ id, f }) => ({
      variantId: id,
      productId: f.productId,
      title: f.title,
      variantTitle: f.variantTitle,
      sku: sku.get(id) ?? "",
      price: f.price,
      available: f.available,
      weightGrams: f.weightGrams,
      image: f.image?.url ?? null,
    }));
}
