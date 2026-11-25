// Not server-only: scripts/create-owner.ts reaches this through modules/auth/auth.ts (plain Node).
import { connectMongoose } from "@/lib/db/mongo";
import { logger } from "@/lib/logger";
import { maskPhone } from "@/lib/phone";
import { enqueueNotification } from "@/lib/queue";
import { loadBrand } from "./brand";
import { loadEventTemplates, loadNotificationSettings } from "./data";
import { Notification } from "./models";
import {
  CHANNELS,
  fillTemplate,
  isPrivatePurpose,
  messageMoney,
  type Channel,
  type Language,
  type NotificationEvent,
  type TemplateVars,
} from "./templates";

/**
 * Sending a message (FR-OR-06/07): write it to the log, then queue it for the worker. The worker
 * marks it sent or failed; failed sends retry on their own and staff can send them again by hand.
 * The app never talks to an SMS or email provider directly.
 */

const DAY = 86_400_000;

export type OutgoingMessage = {
  channel: Channel;
  to: string;
  /** The event (order_confirmed…) or another purpose (checkout_otp, password_reset…). */
  purpose: string;
  text: string;
  subject?: string;
  button?: { label: string; url: string } | null;
  orderId?: string | null;
  orderNo?: string | null;
  language?: Language | null;
  attachInvoiceId?: string | null;
};

/** Logs and queues one message. Codes and sign-in links are logged without their text. */
export async function queueMessage(m: OutgoingMessage): Promise<string> {
  await connectMongoose();
  const hidden = isPrivatePurpose(m.purpose);
  const [row] = await Notification.create([
    {
      channel: m.channel,
      to: m.to,
      purpose: m.purpose,
      language: m.language ?? null,
      orderId: m.orderId ?? null,
      orderNo: m.orderNo ?? null,
      subject: m.subject ?? "",
      text: hidden ? "" : m.text,
      button: hidden ? null : (m.button ?? null),
      attachInvoiceId: m.attachInvoiceId ?? null,
      private: hidden,
      expiresAt: new Date(Date.now() + (hidden ? 30 : 365) * DAY),
    },
  ]);
  const logId = String(row._id);
  try {
    if (m.channel === "sms") {
      await enqueueNotification({ kind: "sms", to: m.to, text: m.text, purpose: m.purpose, logId });
    } else {
      await enqueueNotification({
        kind: "email",
        to: m.to,
        subject: m.subject ?? "",
        text: m.text,
        button: m.button ?? null,
        purpose: m.purpose,
        logId,
        attachInvoiceId: m.attachInvoiceId ?? null,
      });
    }
  } catch (err) {
    await Notification.updateOne(
      { _id: logId },
      { $set: { status: "failed", error: "Could not be queued (is Redis running?)" } },
    );
    throw err;
  }
  return logId;
}

export type OrderForMessage = {
  id: string;
  orderNo: string;
  customer: { name: string; phone: string; email?: string | null };
  total: number;
  codAmount: number;
};

export type InvoiceForMessage = { id: string; invoiceNo: string; link: string };

/**
 * The customer's messages for an order event, in the shop's message language, on each channel that
 * is switched on for it (email only if the customer gave an address). A channel that can't be queued
 * is logged and skipped: messages never undo the order change that caused them.
 */
export async function notifyOrder(
  event: NotificationEvent,
  o: OrderForMessage,
  invoice?: InvoiceForMessage,
): Promise<Channel[]> {
  let queued: Channel[] = [];
  try {
    const [settings, templates, brand] = await Promise.all([
      loadNotificationSettings(),
      loadEventTemplates(event),
      loadBrand(),
    ]);
    const lang = settings.language;
    for (const channel of CHANNELS) {
      if (!settings.enabled[event][channel]) continue;
      const to = channel === "sms" ? o.customer.phone : (o.customer.email ?? "").trim();
      if (!to) continue;
      const vars: TemplateVars = {
        store: brand.name,
        name: o.customer.name,
        order_no: o.orderNo,
        total: messageMoney(o.total, channel, lang),
        cod_amount: messageMoney(o.codAmount, channel, lang),
        invoice_no: invoice?.invoiceNo ?? "",
        invoice_link: invoice?.link ?? "",
      };
      const common = { channel, to, purpose: event, orderId: o.id, orderNo: o.orderNo, language: lang };
      try {
        if (channel === "sms") {
          await queueMessage({ ...common, text: fillTemplate(templates.sms[lang], vars) });
        } else {
          const t = templates.email[lang];
          await queueMessage({
            ...common,
            subject: fillTemplate(t.subject, vars),
            text: fillTemplate(t.body, vars),
            button: invoice ? { label: lang === "bn" ? "ইনভয়েস দেখুন" : "View invoice", url: invoice.link } : null,
            // The confirmation email carries the PDF (SRS §2.5).
            attachInvoiceId: event === "order_confirmed" && invoice ? invoice.id : null,
          });
        }
        queued = [...queued, channel];
      } catch (err) {
        logger.error(
          { err, event, channel, orderNo: o.orderNo, to: maskPhone(o.customer.phone) },
          "message not queued",
        );
      }
    }
  } catch (err) {
    logger.error({ err, event, orderNo: o.orderNo }, "order messages could not be prepared");
  }
  return queued;
}

export class ResendError extends Error {}

/** Sends a logged message again, as it was (FR-OR-07). */
export async function resendMessage(
  id: string,
  by: string,
): Promise<{ to: string; purpose: string; orderNo: string | null }> {
  await connectMongoose();
  const row = await Notification.findById(id).lean<Record<string, unknown> & { _id: unknown }>();
  if (!row) throw new ResendError("That message is no longer in the log.");
  if (row.private)
    throw new ResendError("Codes and sign-in links can't be sent again. The customer can ask for a new one.");
  if (row.status === "queued") throw new ResendError("This message is still waiting to be sent.");
  const claimed = await Notification.updateOne(
    { _id: row._id, status: row.status },
    { $set: { status: "queued", error: null, sentAt: null, lastResentBy: by }, $inc: { resends: 1 } },
  );
  if (claimed.modifiedCount === 0) throw new ResendError("Someone else just sent this again.");
  const logId = String(row._id);
  const base = { to: String(row.to), text: String(row.text), purpose: String(row.purpose), logId };
  try {
    if (row.channel === "sms") await enqueueNotification({ kind: "sms", ...base });
    else
      await enqueueNotification({
        kind: "email",
        ...base,
        subject: String(row.subject ?? ""),
        button: (row.button as { label: string; url: string } | null) ?? null,
        attachInvoiceId: (row.attachInvoiceId as string | null) ?? null,
      });
  } catch (err) {
    await Notification.updateOne({ _id: row._id }, { $set: { status: "failed", error: "Could not be queued" } });
    throw err;
  }
  return { to: base.to, purpose: base.purpose, orderNo: (row.orderNo as string | null) ?? null };
}
