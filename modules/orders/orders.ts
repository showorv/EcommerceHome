import type { CartLine } from "@/modules/cart/logic";
import type { CheckoutInput, CheckoutTotals, PaymentMethod } from "@/modules/checkout/checkout";
import type { WalletType } from "@/modules/payments/payments";
import type { Risk, RiskLevel } from "./risk";

/**
 * Orders (SRS §3, §7 "orders"). Pure and browser-safe: the order a checkout turns into, its number and
 * the words shown about it. Saving it (with the stock reservation) is in place.ts. Money is poisha.
 */

// ---------- Statuses (FR-OR-01, FR-OR-02; the allowed moves between them arrive in 2.10) ----------

export const ORDER_STATUSES = [
  "pending",
  "on_hold",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "partially_delivered",
  "cancelled",
  "returned",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_NAMES: Record<OrderStatus, string> = {
  pending: "Pending",
  on_hold: "On hold",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  partially_delivered: "Partially delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

export const PAYMENT_STATUSES = ["unpaid", "advance_pending", "advance_verified", "paid", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_STATUS_NAMES: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  advance_pending: "Advance to check",
  advance_verified: "Advance checked",
  paid: "Paid",
  refunded: "Refunded",
};

// ---------- Numbers ----------

/** Order numbers look like SR10001 (SRS §2.5). They come from the "orderNo" counter. */
export const ORDER_NO_PREFIX = "SR";
export const ORDER_NO_START = 10001;
export const formatOrderNo = (seq: number) => `${ORDER_NO_PREFIX}${seq}`;
export const isOrderNo = (v: unknown): v is string => typeof v === "string" && /^SR\d{5,9}$/.test(v);

/** The browser's key for one order attempt: a UUID, so a double click or a retry is the same order. */
export function normalizeOrderKey(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(k) ? k : null;
}

/** Orders from one phone number in an hour (NFR-SEC-05: "checkout 5 orders per hour per phone"). */
export const ORDERS_PER_PHONE_PER_HOUR = 5;
/** How long a pending order holds its stock when the setting isn't saved yet (FR-CO-07). */
export const DEFAULT_RESERVATION_HOURS = 24;

// ---------- The order document ----------

export type OrderItem = {
  productId: string;
  variantId: string;
  title: string;
  variantTitle: string;
  sku: string;
  slug: string;
  image: string | null;
  /** Price paid per unit and the landed cost per unit when ordered (for profit reports). */
  price: number;
  cost: number;
  qty: number;
  weightGrams: number;
};

export type NewOrder = {
  orderNo: string;
  userId: string | null;
  customer: { name: string; phone: string; email: string };
  shippingAddress: {
    districtId: string;
    district: string;
    areaId: string;
    area: string;
    line: string;
    note: string;
  };
  zoneId: string;
  zoneName: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  couponCode: string | null;
  deliveryCharge: number;
  /** Why delivery costs what it does ("weight", "free-threshold", "coupon"…) and the usual price. */
  delivery: { reason: string; regularCharge: number; weightGrams: number; minDays: number; maxDays: number };
  codFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  advance: {
    method: WalletType;
    senderNumber: string;
    trxId: string;
    amount: number;
    status: "pending";
  } | null;
  codAmount: number;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: Date; by: string | null; note: string }[];
  /** Stock held for this order until it is confirmed, or until `until` passes (FR-CO-07). */
  reservation: { active: boolean; until: Date; releasedAt: Date | null };
  riskScore: number;
  riskLevel: RiskLevel;
  riskReasons: string[];
  source: "web";
  idempotencyKey: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
};

export type VariantSnapshot = { sku: string; cost: number };

/**
 * The order a checked checkout becomes. `snapshot` adds what the cart doesn't carry (SKU, cost) so later
 * product edits never change the order or profit reports (SRS §7 design notes).
 */
export function buildOrder(input: {
  orderNo: string;
  idempotencyKey: string;
  checkout: CheckoutInput;
  lines: CartLine[];
  totals: CheckoutTotals;
  zone: { id: string; name: string };
  district: string;
  area: string;
  snapshot: Map<string, VariantSnapshot>;
  userId: string | null;
  ip: string | null;
  userAgent: string | null;
  now: Date;
  reservationHours: number;
  /** The risk score staff see (SRS §2.4). */
  risk: Risk;
}): NewOrder {
  const { checkout: c, totals: t, now } = input;
  const advance =
    t.advanceDue > 0 && c.payWallet
      ? {
          method: c.payWallet,
          senderNumber: c.senderNumber,
          trxId: c.trxId,
          amount: t.advanceDue,
          status: "pending" as const,
        }
      : null;
  return {
    orderNo: input.orderNo,
    userId: input.userId,
    customer: { name: c.name, phone: c.phone, email: c.email },
    shippingAddress: {
      districtId: c.districtId,
      district: input.district,
      areaId: c.areaId,
      area: input.area,
      line: c.address,
      note: c.note,
    },
    zoneId: input.zone.id,
    zoneName: input.zone.name,
    items: input.lines.map((l) => {
      const s = input.snapshot.get(l.variantId);
      if (!s) throw new Error(`No snapshot for variant ${l.variantId}`);
      return {
        productId: l.productId,
        variantId: l.variantId,
        title: l.title,
        variantTitle: l.variantTitle,
        sku: s.sku,
        slug: l.slug,
        image: l.image?.url ?? null,
        price: l.price,
        cost: s.cost,
        qty: l.qty,
        weightGrams: l.weightGrams,
      };
    }),
    subtotal: t.subtotal,
    discount: t.discount,
    // Only a code the server accepted reaches here (checkCheckout drops the order otherwise).
    couponCode: c.couponCode || null,
    deliveryCharge: t.delivery.charge,
    delivery: {
      reason: t.delivery.reason,
      regularCharge: t.delivery.regularCharge,
      weightGrams: t.delivery.weightGrams,
      minDays: t.delivery.minDays,
      maxDays: t.delivery.maxDays,
    },
    codFee: t.codFee,
    total: t.total,
    paymentMethod: t.paymentMethod,
    advance,
    codAmount: t.codAmount,
    paymentStatus: advance ? "advance_pending" : "unpaid",
    status: "pending",
    statusHistory: [{ status: "pending", at: now, by: null, note: "Placed on the website" }],
    reservation: {
      active: true,
      until: new Date(now.getTime() + input.reservationHours * 3600_000),
      releasedAt: null,
    },
    riskScore: input.risk.score,
    riskLevel: input.risk.level,
    riskReasons: input.risk.reasons,
    source: "web",
    idempotencyKey: input.idempotencyKey,
    ip: input.ip,
    userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null,
    createdAt: now,
  };
}

/** The "order received" SMS (SRS §2.5). Editable templates arrive with the other notifications. */
export function orderReceivedSms(orderNo: string, store: string): string {
  return `${store}: Order #${orderNo} received. We will call you to confirm.`;
}

/**
 * A variant now at or below its low-stock level (or sold out): its product page shows "Only N left" or
 * "Sold out", so that page is rebuilt after the order. Other orders leave the cached pages as they are.
 */
export function showsLowStock(variant: { stock: number; reserved: number }, threshold: number): boolean {
  return Math.max(0, variant.stock - variant.reserved) <= threshold;
}
