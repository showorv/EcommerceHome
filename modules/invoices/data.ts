import "server-only";
import type { ClientSession } from "mongoose";
import { encrypt, decrypt, randomToken, sha256 } from "@/lib/crypto";
import { connectMongoose } from "@/lib/db/mongo";
import { env } from "@/lib/env";
import { PAYMENT_METHOD_NAMES, type PaymentMethod } from "@/modules/checkout/checkout";
import { Order } from "@/modules/orders/models";
import type { OrderStatus } from "@/modules/orders/orders";
import { Setting } from "@/modules/payments/models";
import { nextSequenceInSession } from "@/modules/shared/counters";
import {
  dhakaYear,
  formatInvoiceNo,
  invoiceCounter,
  invoiceSnapshot,
  invoiceUrl,
  isInvoiceToken,
  linkState,
  readInvoiceSettings,
  TOKEN_BYTES,
  type InvoiceSettings,
  type InvoiceSnapshot,
  type LinkState,
} from "./invoices";
import { Invoice } from "./models";

/** Invoices on the server (FR-OR-03/04): settings, issuing on confirmation, links. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

const SETTING_ID = "invoice";
const DAY = 86_400_000;

// ---------- Settings ----------

export async function loadInvoiceSettings(): Promise<{ settings: InvoiceSettings; saved: boolean }> {
  await connectMongoose();
  const s = await Setting.findById(SETTING_ID).lean<AnyDoc>();
  const saved = !!s?.value && Object.keys(s.value).length > 0;
  return { settings: readInvoiceSettings(saved ? s!.value : {}, env().STORE_NAME), saved };
}

export async function saveInvoiceSettings(
  v: InvoiceSettings,
  by: string,
): Promise<{ before: InvoiceSettings; after: InvoiceSettings }> {
  const { settings: before } = await loadInvoiceSettings();
  await Setting.updateOne({ _id: SETTING_ID }, { $set: { value: v, updatedBy: by } }, { upsert: true });
  return { before, after: v };
}

// ---------- Links ----------

/** A fresh link: the token (shown once, put in the SMS), its hash for lookups and an encrypted copy. */
function newToken(linkDays: number, now: Date) {
  const token = randomToken(TOKEN_BYTES);
  return {
    token,
    accessTokenHash: sha256(token),
    accessTokenEnc: encrypt(token, env().ENCRYPTION_KEY),
    tokenExpiresAt: new Date(now.getTime() + linkDays * DAY),
  };
}

export type Issued = { id: string; invoiceNo: string; token: string };

/**
 * The invoice for an order being confirmed (FR-OR-03), inside the confirmation's transaction: if the
 * confirmation fails, the number goes back too, so invoice numbers have no gaps.
 */
export async function issueInvoice(
  order: AnyDoc,
  settings: InvoiceSettings,
  now: Date,
  session: ClientSession,
): Promise<Issued> {
  const year = dhakaYear(now);
  const invoiceNo = formatInvoiceNo(year, await nextSequenceInSession(session, invoiceCounter(year)));
  const link = newToken(settings.linkDays, now);
  const snapshot = invoiceSnapshot(
    order,
    {
      invoiceNo,
      issuedAt: now,
      paymentMethodName: PAYMENT_METHOD_NAMES[order.paymentMethod as PaymentMethod] ?? String(order.paymentMethod),
    },
    settings,
  );
  const [doc] = await Invoice.create(
    [
      {
        invoiceNo,
        orderId: String(order._id),
        orderNo: String(order.orderNo),
        issuedAt: now,
        snapshot,
        accessTokenHash: link.accessTokenHash,
        accessTokenEnc: link.accessTokenEnc,
        tokenExpiresAt: link.tokenExpiresAt,
      },
    ],
    { session },
  );
  return { id: String(doc._id), invoiceNo, token: link.token };
}

/**
 * The invoice a link opens, or null: unknown, changed, turned off or expired all look the same.
 * Also the order's current status, so the page can say if it was cancelled or returned.
 */
export async function invoiceByToken(
  token: string,
  now = Date.now(),
): Promise<{ id: string; snapshot: InvoiceSnapshot; orderStatus: OrderStatus | null } | null> {
  if (!isInvoiceToken(token)) return null;
  await connectMongoose();
  const inv = await Invoice.findOne({ accessTokenHash: sha256(token) })
    .select("snapshot orderId revokedAt tokenExpiresAt")
    .lean<AnyDoc>();
  if (!inv || linkState(inv as { revokedAt: Date | null; tokenExpiresAt: Date }, now) !== "active") return null;
  const order = await Order.findById(inv.orderId).select("status").lean<AnyDoc>();
  return {
    id: String(inv._id),
    snapshot: inv.snapshot as InvoiceSnapshot,
    orderStatus: (order?.status as OrderStatus | undefined) ?? null,
  };
}

export type AdminInvoice = {
  id: string;
  invoiceNo: string;
  issuedAt: string;
  link: string;
  state: LinkState;
  expiresAt: string;
  pdfReady: boolean;
};

/** The invoice beside an order in admin, with its current link. */
export async function adminInvoice(orderId: string, now: number): Promise<AdminInvoice | null> {
  await connectMongoose();
  const inv = await Invoice.findOne({ orderId })
    .select("invoiceNo issuedAt accessTokenEnc accessTokenHash revokedAt tokenExpiresAt pdfTokenHash")
    .lean<AnyDoc>();
  if (!inv) return null;
  return {
    id: String(inv._id),
    invoiceNo: String(inv.invoiceNo),
    issuedAt: new Date(inv.issuedAt).toISOString(),
    link: invoiceUrl(env().APP_URL, decrypt(String(inv.accessTokenEnc), env().ENCRYPTION_KEY)),
    state: linkState(inv as { revokedAt: Date | null; tokenExpiresAt: Date }, now),
    expiresAt: new Date(inv.tokenExpiresAt).toISOString(),
    pdfReady: inv.pdfTokenHash === inv.accessTokenHash,
  };
}

/**
 * A new link for the order's invoice (FR-OR-04: regenerate): the old one stops working at once and
 * the PDF is printed again, since its QR code points to the link.
 */
export async function replaceInvoiceLink(
  orderId: string,
): Promise<{ id: string; invoiceNo: string; token: string } | null> {
  await connectMongoose();
  const { settings } = await loadInvoiceSettings();
  const link = newToken(settings.linkDays, new Date());
  const inv = await Invoice.findOneAndUpdate(
    { orderId },
    {
      $set: {
        accessTokenHash: link.accessTokenHash,
        accessTokenEnc: link.accessTokenEnc,
        tokenExpiresAt: link.tokenExpiresAt,
        revokedAt: null,
        pdf: null,
        pdfTokenHash: null,
        pdfRenderedAt: null,
      },
    },
    { new: true },
  )
    .select("invoiceNo")
    .lean<AnyDoc>();
  return inv ? { id: String(inv._id), invoiceNo: String(inv.invoiceNo), token: link.token } : null;
}

/** Turns the link off (FR-OR-04: revoke). A new link can be made later. */
export async function revokeInvoiceLink(orderId: string): Promise<{ id: string; invoiceNo: string } | null> {
  await connectMongoose();
  const inv = await Invoice.findOneAndUpdate({ orderId }, { $set: { revokedAt: new Date() } }, { new: true })
    .select("invoiceNo")
    .lean<AnyDoc>();
  return inv ? { id: String(inv._id), invoiceNo: String(inv.invoiceNo) } : null;
}
