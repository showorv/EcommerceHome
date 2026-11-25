import type { PaymentMethod } from "@/modules/checkout/checkout";
import type { OrderStatus, PaymentStatus } from "@/modules/orders/orders";
import {
  CUSTOMER_PAYMENT,
  CUSTOMER_STATUS,
  customerTimeline,
  orderSteps,
  type HistoryEntry,
  type Step,
} from "./account";

/**
 * An order as its customer sees it (FR-AC-06/07). Pure: built from the stored order. Tracking by number
 * and phone gets the short version (no name, phone, street address or invoice); the account gets it all.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

export type CustomerOrderItem = {
  title: string;
  variantTitle: string;
  qty: number;
  price: number;
  image: string | null;
  slug: string;
};

export type CustomerOrder = {
  orderNo: string;
  placedAt: string;
  status: OrderStatus;
  statusLabel: string;
  statusText: string;
  steps: Step[];
  timeline: { label: string; at: string }[];
  items: CustomerOrderItem[];
  itemCount: number;
  subtotal: number;
  discount: number;
  couponCode: string | null;
  deliveryCharge: number;
  codFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  payment: string;
  /** Still to pay at the door (0 once delivered or paid in full). */
  toPay: number;
  /** "Adabor, Dhaka". */
  place: string;
  /** Account view only. */
  full: null | {
    name: string;
    phone: string;
    line: string;
    note: string;
    /** The invoice, once the order is confirmed. */
    invoiceNo: string | null;
  };
};

export type OrderListRow = Pick<
  CustomerOrder,
  "orderNo" | "placedAt" | "status" | "statusLabel" | "total" | "itemCount"
> & { firstItem: string; image: string | null };

const DONE: OrderStatus[] = ["delivered", "partially_delivered", "cancelled", "returned"];

function history(d: AnyDoc): HistoryEntry[] {
  return ((d.statusHistory ?? []) as AnyDoc[]).map((h) => ({
    status: h.status as OrderStatus,
    at: new Date(h.at).toISOString(),
  }));
}

export function customerOrder(d: AnyDoc, opts: { full: boolean; invoiceNo?: string | null }): CustomerOrder {
  const status = d.status as OrderStatus;
  const paymentStatus = d.paymentStatus as PaymentStatus;
  const a = d.shippingAddress ?? {};
  const items = ((d.items ?? []) as AnyDoc[]).map((i) => ({
    title: String(i.title),
    variantTitle: String(i.variantTitle ?? ""),
    qty: Number(i.qty),
    price: Number(i.price),
    image: i.image ? String(i.image) : null,
    slug: String(i.slug ?? ""),
  }));
  const h = history(d);
  const toPay =
    DONE.includes(status) || paymentStatus === "paid" || paymentStatus === "refunded" ? 0 : Number(d.codAmount ?? 0);
  return {
    orderNo: String(d.orderNo),
    placedAt: new Date(d.createdAt).toISOString(),
    status,
    statusLabel: CUSTOMER_STATUS[status].label,
    statusText: CUSTOMER_STATUS[status].text,
    steps: orderSteps(status, h),
    timeline: customerTimeline(h),
    items,
    itemCount: items.reduce((n, i) => n + i.qty, 0),
    subtotal: Number(d.subtotal ?? 0),
    discount: Number(d.discount ?? 0),
    couponCode: d.couponCode ? String(d.couponCode) : null,
    deliveryCharge: Number(d.deliveryCharge ?? 0),
    codFee: Number(d.codFee ?? 0),
    total: Number(d.total ?? 0),
    paymentMethod: d.paymentMethod as PaymentMethod,
    payment: CUSTOMER_PAYMENT[paymentStatus] ?? "",
    toPay,
    place: [a.area, a.district].filter(Boolean).join(", "),
    full: opts.full
      ? {
          name: String(d.customer?.name ?? ""),
          phone: String(d.customer?.phone ?? ""),
          line: String(a.line ?? ""),
          note: String(a.note ?? ""),
          invoiceNo: opts.invoiceNo ?? null,
        }
      : null,
  };
}

export function orderListRow(d: AnyDoc): OrderListRow {
  const status = d.status as OrderStatus;
  const items = (d.items ?? []) as AnyDoc[];
  const first = items[0];
  return {
    orderNo: String(d.orderNo),
    placedAt: new Date(d.createdAt).toISOString(),
    status,
    statusLabel: CUSTOMER_STATUS[status].label,
    total: Number(d.total ?? 0),
    itemCount: items.reduce((n, i) => n + Number(i.qty ?? 0), 0),
    firstItem: first ? String(first.title) + (items.length > 1 ? ` + ${items.length - 1} more` : "") : "",
    image: first?.image ? String(first.image) : null,
  };
}
