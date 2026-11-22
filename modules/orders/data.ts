import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { connectMongoose } from "@/lib/db/mongo";
import { env, isProd } from "@/lib/env";
import type { PaymentMethod } from "@/modules/checkout/checkout";
import type { WalletType } from "@/modules/payments/payments";
import { Order } from "./models";
import { readReceipt, signReceipt } from "./receipt";

/** The order this browser just placed, for the thank-you page (SRS §2.5). */

const COOKIE = "last_order";
const RECEIPT_HOURS = 6;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

export async function rememberReceipt(orderId: string): Promise<void> {
  const expiresAt = Date.now() + RECEIPT_HOURS * 3600_000;
  (await cookies()).set(COOKIE, signReceipt(env().BETTER_AUTH_SECRET, orderId, expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    maxAge: RECEIPT_HOURS * 3600,
  });
}

export type ReceiptView = {
  orderNo: string;
  placedAt: string;
  name: string;
  phone: string;
  address: string;
  items: {
    productId: string;
    title: string;
    variantTitle: string;
    qty: number;
    price: number;
    image: string | null;
    slug: string;
  }[];
  subtotal: number;
  discount: number;
  couponCode: string | null;
  deliveryCharge: number;
  deliveryFree: boolean;
  codFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  advance: { method: WalletType; amount: number; trxIdEnd: string } | null;
  codAmount: number;
  minDays: number;
  maxDays: number;
};

/** The order in this browser's receipt cookie, or null (no cookie, out of date, or forged). */
export async function getReceiptOrder(): Promise<ReceiptView | null> {
  await connection(); // per visitor, at request time: the cookie and the clock decide what shows
  const id = readReceipt(env().BETTER_AUTH_SECRET, (await cookies()).get(COOKIE)?.value, Date.now());
  if (!id) return null;
  await connectMongoose();
  const d = await Order.findById(id).lean<AnyDoc>();
  if (!d) return null;
  const a = d.shippingAddress ?? {};
  return {
    orderNo: String(d.orderNo),
    placedAt: new Date(d.createdAt).toISOString(),
    name: String(d.customer?.name ?? ""),
    phone: String(d.customer?.phone ?? ""),
    address: [a.line, a.area, a.district].filter(Boolean).join(", "),
    items: ((d.items ?? []) as AnyDoc[]).map((i) => ({
      productId: String(i.productId ?? ""),
      title: String(i.title),
      variantTitle: String(i.variantTitle ?? ""),
      qty: Number(i.qty),
      price: Number(i.price),
      image: i.image ? String(i.image) : null,
      slug: String(i.slug ?? ""),
    })),
    subtotal: Number(d.subtotal),
    discount: Number(d.discount ?? 0),
    couponCode: d.couponCode ? String(d.couponCode) : null,
    deliveryCharge: Number(d.deliveryCharge),
    deliveryFree: Number(d.deliveryCharge) === 0,
    codFee: Number(d.codFee ?? 0),
    total: Number(d.total),
    paymentMethod: d.paymentMethod as PaymentMethod,
    advance: d.advance
      ? {
          method: d.advance.method as WalletType,
          amount: Number(d.advance.amount),
          // Only the end of the TrxID is shown back (NFR-SEC-14).
          trxIdEnd: String(d.advance.trxId ?? "").slice(-4),
        }
      : null,
    codAmount: Number(d.codAmount),
    minDays: Number(d.delivery?.minDays ?? 1),
    maxDays: Number(d.delivery?.maxDays ?? 3),
  };
}
