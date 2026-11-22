import { z } from "zod";
import type { WalletType } from "@/modules/payments/payments";

/**
 * Invoices (SRS §2.4–2.5, FR-OR-03…05). Pure and browser-safe: the number, what an invoice shows (a
 * snapshot taken when the order is confirmed, so later edits never change it), the settings and the
 * state of its link. Issuing is issue.ts, the PDF pdf.ts and html.ts. Money is poisha.
 */

// ---------- Number ----------

/** INV-2026-000123: one sequence per year, in Dhaka time (FR-OR-03). */
export const invoiceCounter = (year: number) => `invoice-${year}`;
export const formatInvoiceNo = (year: number, seq: number) => `INV-${year}-${String(seq).padStart(6, "0")}`;
export const isInvoiceNo = (v: unknown): v is string => typeof v === "string" && /^INV-\d{4}-\d{6,}$/.test(v);

/** The calendar year in Dhaka (UTC+6, no daylight saving). */
export const dhakaYear = (d: Date) => new Date(d.getTime() + 6 * 3600_000).getUTCFullYear();

// ---------- Link (FR-OR-04) ----------

/** 16 random bytes, base64url: 22 characters, short enough for an SMS and impossible to guess. */
export const TOKEN_BYTES = 16;
export const isInvoiceToken = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{22}$/.test(v);
export const invoiceUrl = (appUrl: string, token: string) => `${appUrl.replace(/\/$/, "")}/i/${token}`;

export type LinkState = "active" | "expired" | "revoked";

export function linkState(
  i: { revokedAt: string | Date | null; tokenExpiresAt: string | Date },
  now: number,
): LinkState {
  if (i.revokedAt) return "revoked";
  return new Date(i.tokenExpiresAt).getTime() <= now ? "expired" : "active";
}

/** The SMS with a new link (after the old one was replaced). */
export const invoiceLinkSms = (orderNo: string, store: string, link: string) =>
  `${store}: Your invoice for order #${orderNo}: ${link}`;

export const LINK_STATE_NAMES: Record<LinkState, string> = {
  active: "Link works",
  expired: "Link expired",
  revoked: "Link turned off",
};

// ---------- Settings ----------

export type InvoiceSettings = {
  /** Printed at the top of every invoice. */
  shopName: string;
  phone: string;
  email: string;
  address: string;
  /** A short thank-you or terms line at the bottom. */
  footer: string;
  /** How long a link works (FR-OR-04: "e.g. 90 days"). */
  linkDays: number;
};

export const DEFAULT_INVOICE_SETTINGS: Omit<InvoiceSettings, "shopName"> = {
  phone: "",
  email: "",
  address: "",
  footer: "Thank you for shopping with us. Check the parcel before you pay the courier.",
  linkDays: 90,
};

const line = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}: keep it under ${max} characters`)
    .transform((s) => s.replace(/\s+/g, " "));

export const invoiceSettingsInput = z.object({
  shopName: z
    .string()
    .trim()
    .min(2, "Shop name: at least 2 characters")
    .max(80, "Shop name: keep it under 80 characters"),
  phone: line(40, "Phone"),
  email: z.union([z.literal(""), z.email("Email: enter a valid address").max(120)]),
  address: line(200, "Address"),
  footer: line(300, "Footer"),
  linkDays: z.coerce
    .number({ error: "Link lifetime: enter a number of days" })
    .int("Link lifetime: use whole days")
    .min(1, "Link lifetime: at least 1 day")
    .max(730, "Link lifetime: at most 730 days"),
});

/** Saved settings (or anything odd in the database) → settings, falling back to the defaults. */
export function readInvoiceSettings(v: unknown, storeName: string): InvoiceSettings {
  const p = invoiceSettingsInput.safeParse({ ...DEFAULT_INVOICE_SETTINGS, shopName: storeName, ...(v as object) });
  return p.success ? p.data : { ...DEFAULT_INVOICE_SETTINGS, shopName: storeName };
}

// ---------- What an invoice shows (FR-OR-05) ----------

export type InvoiceSnapshot = {
  invoiceNo: string;
  orderNo: string;
  /** Confirmation time. */
  issuedAt: string;
  orderedAt: string;
  store: { name: string; phone: string; email: string; address: string };
  customer: { name: string; phone: string; email: string };
  address: { line: string; area: string; district: string; zoneName: string };
  items: { title: string; variantTitle: string; sku: string; qty: number; price: number }[];
  subtotal: number;
  discount: number;
  couponCode: string | null;
  deliveryCharge: number;
  codFee: number;
  total: number;
  paymentMethod: string;
  /** Only the last 4 characters of the TrxID are printed. */
  advance: { method: WalletType; amount: number; trxLast4: string } | null;
  codAmount: number;
  footer: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- an order read straight from the database
type AnyDoc = Record<string, any>;

export function invoiceSnapshot(
  o: AnyDoc,
  meta: { invoiceNo: string; issuedAt: Date; paymentMethodName: string },
  s: InvoiceSettings,
): InvoiceSnapshot {
  const a = o.shippingAddress ?? {};
  const adv = o.advance && o.advance.status !== "not_found" ? o.advance : null;
  return {
    invoiceNo: meta.invoiceNo,
    orderNo: String(o.orderNo),
    issuedAt: meta.issuedAt.toISOString(),
    orderedAt: new Date(o.createdAt).toISOString(),
    store: { name: s.shopName, phone: s.phone, email: s.email, address: s.address },
    customer: {
      name: String(o.customer?.name ?? ""),
      phone: String(o.customer?.phone ?? "").replace(/^\+88/, ""),
      email: String(o.customer?.email ?? ""),
    },
    address: {
      line: String(a.line ?? ""),
      area: String(a.area ?? ""),
      district: String(a.district ?? ""),
      zoneName: String(o.zoneName ?? ""),
    },
    items: ((o.items ?? []) as AnyDoc[]).map((i) => ({
      title: String(i.title),
      variantTitle: String(i.variantTitle ?? ""),
      sku: String(i.sku ?? ""),
      qty: Number(i.qty),
      price: Number(i.price),
    })),
    subtotal: Number(o.subtotal),
    discount: Number(o.discount ?? 0),
    couponCode: o.couponCode ?? null,
    deliveryCharge: Number(o.deliveryCharge ?? 0),
    codFee: Number(o.codFee ?? 0),
    total: Number(o.total),
    paymentMethod: meta.paymentMethodName,
    advance: adv
      ? { method: adv.method, amount: Number(adv.amount ?? 0), trxLast4: String(adv.trxId ?? "").slice(-4) }
      : null,
    codAmount: Number(o.codAmount),
    footer: s.footer,
  };
}

/** "21 Nov 2026" in Dhaka time. */
export function invoiceDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  }).format(new Date(iso));
}
