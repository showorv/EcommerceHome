"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enqueueInvoicePdf, enqueueNotification } from "@/lib/queue";
import { writeAudit } from "@/modules/audit/audit";
import { checkStaff, requestMeta } from "@/modules/auth/session";
import { Order } from "@/modules/orders/models";
import { isOrderNo } from "@/modules/orders/orders";
import { replaceInvoiceLink, revokeInvoiceLink, saveInvoiceSettings } from "./data";
import { invoiceLinkSms, invoiceSettingsInput, invoiceUrl } from "./invoices";

/** Invoice links (FR-OR-04) and settings: permission → zod → change → audit → refresh. */

export type InvoiceActionResult = { ok: true; message: string } | { ok: false; error: string };

const denied = (status: number): InvoiceActionResult => ({
  ok: false,
  error: status === 401 ? "Please sign in again." : "You do not have permission.",
});

const orderNoInput = z.string().refine(isOrderNo, "Unknown order");
const newLinkInput = z.object({ orderNo: orderNoInput, sendSms: z.boolean().default(false) });
const revokeInput = z.object({ orderNo: orderNoInput });

async function orderFor(orderNo: string) {
  return Order.findOne({ orderNo }).select("_id customer.phone").lean<{ _id: unknown; customer: { phone: string } }>();
}

/** A new link: the old one stops working at once, and the PDF is printed again for the new QR code. */
export async function newInvoiceLinkAction(raw: unknown): Promise<InvoiceActionResult> {
  const g = await checkStaff("orders.update");
  if (!g.ok) return denied(g.status);
  const p = newLinkInput.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the fields." };
  try {
    const order = await orderFor(p.data.orderNo);
    const inv = order ? await replaceInvoiceLink(String(order._id)) : null;
    if (!order || !inv) return { ok: false, error: "This order has no invoice yet." };
    const link = invoiceUrl(env().APP_URL, inv.token);
    await enqueueInvoicePdf(inv.id).catch((err) => logger.error({ err }, "invoice PDF job could not be queued"));
    if (p.data.sendSms) {
      await enqueueNotification({
        kind: "sms",
        to: order.customer.phone,
        text: invoiceLinkSms(p.data.orderNo, env().STORE_NAME, link),
        purpose: "invoice_link",
      });
    }
    await writeAudit({
      actor: { id: g.ctx.user.id, email: g.ctx.user.email },
      action: "invoice.new_link",
      entity: "invoice",
      entityId: inv.id,
      after: { orderNo: p.data.orderNo, invoiceNo: inv.invoiceNo, smsSent: p.data.sendSms },
      ...(await requestMeta()),
    });
    refresh();
    return {
      ok: true,
      message: p.data.sendSms
        ? `New link made for ${inv.invoiceNo} and sent to the customer. The old link no longer works.`
        : `New link made for ${inv.invoiceNo}. The old link no longer works.`,
    };
  } catch (err) {
    logger.error({ err }, "new invoice link failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Turns the link off; a new one can be made later. */
export async function revokeInvoiceLinkAction(raw: unknown): Promise<InvoiceActionResult> {
  const g = await checkStaff("orders.update");
  if (!g.ok) return denied(g.status);
  const p = revokeInput.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the fields." };
  try {
    const order = await orderFor(p.data.orderNo);
    const inv = order ? await revokeInvoiceLink(String(order._id)) : null;
    if (!order || !inv) return { ok: false, error: "This order has no invoice yet." };
    await writeAudit({
      actor: { id: g.ctx.user.id, email: g.ctx.user.email },
      action: "invoice.revoke_link",
      entity: "invoice",
      entityId: inv.id,
      after: { orderNo: p.data.orderNo, invoiceNo: inv.invoiceNo },
      ...(await requestMeta()),
    });
    refresh();
    return { ok: true, message: `The link for ${inv.invoiceNo} is turned off.` };
  } catch (err) {
    logger.error({ err }, "revoke invoice link failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function saveInvoiceSettingsAction(raw: unknown): Promise<InvoiceActionResult> {
  const g = await checkStaff("settings.manage");
  if (!g.ok) return denied(g.status);
  const p = invoiceSettingsInput.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the fields." };
  try {
    const { before, after } = await saveInvoiceSettings(p.data, g.ctx.user.id);
    await writeAudit({
      actor: { id: g.ctx.user.id, email: g.ctx.user.email },
      action: "invoices.settings",
      entity: "settings",
      entityId: "invoice",
      before,
      after,
      ...(await requestMeta()),
    });
    refresh();
    return { ok: true, message: "Invoice settings saved. New invoices use them; issued ones stay as they are." };
  } catch (err) {
    logger.error({ err }, "saving invoice settings failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
