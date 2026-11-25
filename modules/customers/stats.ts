import { normalizeBdPhone } from "@/lib/phone";
import type { OrderStatus } from "@/modules/orders/orders";

/**
 * Customers in the admin (FR-AD-06). Pure and browser-safe. A customer is a mobile number: guests have
 * no account, and every order carries a confirmed number, so the number is what ties orders together.
 */

export const OPEN_STATUSES: readonly OrderStatus[] = ["pending", "on_hold", "confirmed", "packed", "shipped"];
/** The order reached the door: the customer kept it, kept part of it, or sent it back. */
export const REACHED_STATUSES: readonly OrderStatus[] = ["delivered", "partially_delivered", "returned"];
/** Orders that count towards what the customer has spent. */
export const KEPT_STATUSES: readonly OrderStatus[] = ["delivered", "partially_delivered"];

export type CustomerStats = {
  orders: number;
  open: number;
  delivered: number;
  partial: number;
  cancelled: number;
  returned: number;
  /** Lifetime value, poisha: totals of delivered and partly delivered orders, less refunds on them. */
  value: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
};

export type StatsOrder = {
  status: OrderStatus;
  total: number;
  refund?: { amount: number } | null;
  createdAt: Date | string;
};

export function statsFromOrders(orders: readonly StatsOrder[]): CustomerStats {
  const s: CustomerStats = {
    orders: orders.length,
    open: 0,
    delivered: 0,
    partial: 0,
    cancelled: 0,
    returned: 0,
    value: 0,
    firstOrderAt: null,
    lastOrderAt: null,
  };
  let first = Infinity;
  let last = -Infinity;
  for (const o of orders) {
    if (OPEN_STATUSES.includes(o.status)) s.open++;
    else if (o.status === "delivered") s.delivered++;
    else if (o.status === "partially_delivered") s.partial++;
    else if (o.status === "cancelled") s.cancelled++;
    else if (o.status === "returned") s.returned++;
    if (KEPT_STATUSES.includes(o.status)) s.value += o.total - (o.refund?.amount ?? 0);
    const t = new Date(o.createdAt).getTime();
    if (t < first) first = t;
    if (t > last) last = t;
  }
  if (orders.length) {
    s.firstOrderAt = new Date(first).toISOString();
    s.lastOrderAt = new Date(last).toISOString();
  }
  return s;
}

/** Share of orders that reached the door and came back. null until one has reached the door. */
export function returnRate(s: Pick<CustomerStats, "delivered" | "partial" | "returned">): number | null {
  const reached = s.delivered + s.partial + s.returned;
  return reached === 0 ? null : s.returned / reached;
}

/** "33%" or "—". */
export function percent(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

// ---------- Addresses in the admin ----------

/** The local form used in links and on screen: +8801712345678 → 01712345678. */
export const localPhone = (phone: string) => phone.replace(/^\+88/, "");

/** The customer page's address segment back to a stored number, or null. */
export function phoneFromParam(param: string): string | null {
  try {
    return normalizeBdPhone(decodeURIComponent(param));
  } catch {
    return null; // a stray "%" in the address
  }
}

export const customerHref = (phone: string) => `/admin/customers/${localPhone(phone)}`;

// ---------- List filters ----------

export const CUSTOMER_SORTS = ["recent", "value", "orders", "returns"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];
export const CUSTOMER_SORT_NAMES: Record<CustomerSort, string> = {
  recent: "Last order",
  value: "Lifetime value",
  orders: "Most orders",
  returns: "Most returns",
};

export const CUSTOMER_SHOWS = ["all", "repeat", "returns", "listed"] as const;
export type CustomerShow = (typeof CUSTOMER_SHOWS)[number];
export const CUSTOMER_SHOW_NAMES: Record<CustomerShow, string> = {
  all: "All",
  repeat: "Ordered 2+ times",
  returns: "Has returns",
  listed: "Blocked or flagged",
};

export const CUSTOMERS_PER_PAGE = 50;

export type CustomerFilters = { q: string; sort: CustomerSort; show: CustomerShow; page: number };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function readCustomerFilters(sp: Record<string, string | string[] | undefined>): CustomerFilters {
  const sort = one(sp.sort) as CustomerSort;
  const show = one(sp.show) as CustomerShow;
  const page = Number.parseInt(one(sp.page), 10);
  return {
    q: one(sp.q).trim().slice(0, 60),
    sort: CUSTOMER_SORTS.includes(sort) ? sort : "recent",
    show: CUSTOMER_SHOWS.includes(show) ? show : "all",
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 1000) : 1,
  };
}

export function customerFiltersQuery(f: Partial<CustomerFilters>, page?: number): string {
  const u = new URLSearchParams();
  if (f.q) u.set("q", f.q);
  if (f.sort && f.sort !== "recent") u.set("sort", f.sort);
  if (f.show && f.show !== "all") u.set("show", f.show);
  if (page && page > 1) u.set("page", String(page));
  return u.size ? `?${u}` : "";
}

/**
 * What the search box means: digits look for a number (typed as 017…, 88017… or +88017…), anything
 * else looks for a name. Returns the text to match, already safe to put in a regular expression.
 */
export function customerSearch(q: string): { phone: string } | { name: string } | null {
  const t = q.trim();
  if (!t) return null;
  const digits = t.replace(/[\s\-()+]/g, "");
  if (/^\d{3,}$/.test(digits)) return { phone: digits.replace(/^(88)?0/, "") };
  return { name: t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") };
}
