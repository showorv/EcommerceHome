/**
 * Shop events for the marketing pixels (FR-AD-13, SRS §8.7). Pure and browser-safe: one event shape,
 * and how it is said to Meta, Google Analytics 4 and TikTok. Money is in poisha here and in taka for them.
 */

export type TrackingIds = { metaPixelId: string | null; ga4Id: string | null; tiktokPixelId: string | null };

export const NO_TRACKING: TrackingIds = { metaPixelId: null, ga4Id: null, tiktokPixelId: null };
export const trackingOn = (ids: TrackingIds) => Boolean(ids.metaPixelId || ids.ga4Id || ids.tiktokPixelId);

export type ShopEventName = "view_item" | "add_to_cart" | "begin_checkout" | "purchase";

export type ShopItem = { id: string; name: string; price: number; qty: number };

export type ShopEvent = {
  name: ShopEventName;
  items: ShopItem[];
  /** Poisha. */
  value: number;
  /** The order number, for purchases. */
  orderNo?: string;
};

/** The same id in the browser pixel and the Conversions API, so Meta and TikTok count an order once. */
export const purchaseEventId = (orderNo: string) => `order-${orderNo}`;

const taka = (poisha: number) => Math.round(poisha) / 100;
export const CURRENCY = "BDT";

const META_NAMES: Record<ShopEventName, string> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
};

const TIKTOK_NAMES: Record<ShopEventName, string> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "CompletePayment",
};

export function metaEvent(e: ShopEvent) {
  return {
    name: META_NAMES[e.name],
    data: {
      content_type: "product",
      content_ids: e.items.map((i) => i.id),
      contents: e.items.map((i) => ({ id: i.id, quantity: i.qty, item_price: taka(i.price) })),
      num_items: e.items.reduce((n, i) => n + i.qty, 0),
      value: taka(e.value),
      currency: CURRENCY,
      ...(e.orderNo ? { order_id: e.orderNo } : {}),
    },
    eventId: e.orderNo ? purchaseEventId(e.orderNo) : undefined,
  };
}

export function ga4Event(e: ShopEvent) {
  return {
    name: e.name,
    params: {
      currency: CURRENCY,
      value: taka(e.value),
      items: e.items.map((i) => ({ item_id: i.id, item_name: i.name, price: taka(i.price), quantity: i.qty })),
      ...(e.orderNo ? { transaction_id: e.orderNo } : {}),
    },
  };
}

export function tiktokEvent(e: ShopEvent) {
  return {
    name: TIKTOK_NAMES[e.name],
    params: {
      content_type: "product",
      contents: e.items.map((i) => ({
        content_id: i.id,
        content_name: i.name,
        quantity: i.qty,
        price: taka(i.price),
      })),
      value: taka(e.value),
      currency: CURRENCY,
    },
    eventId: e.orderNo ? purchaseEventId(e.orderNo) : undefined,
  };
}
