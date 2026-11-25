"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { writeAudit } from "@/modules/audit/audit";
import { checkStaff, requestMeta } from "@/modules/auth/session";
import { saveEventTemplates, saveMessageLanguage } from "./data";
import { ResendError, resendMessage } from "./send";
import { EVENT_INFO, languageInput, purposeName, templateSaveInput } from "./templates";

/** Admin → Notifications: send again, templates, message language. Permission → zod → change → audit. */

export type NotificationActionResult = { ok: true; message: string } | { ok: false; error: string };

const denied = (status: number): NotificationActionResult => ({
  ok: false,
  error: status === 401 ? "Please sign in again." : "You do not have permission.",
});
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the fields.";
const failed: NotificationActionResult = { ok: false, error: "Something went wrong. Please try again." };

const resendInput = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/, "Unknown message") });

export async function resendNotificationAction(raw: unknown): Promise<NotificationActionResult> {
  const g = await checkStaff("orders.update");
  if (!g.ok) return denied(g.status);
  const p = resendInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  try {
    const sent = await resendMessage(p.data.id, g.ctx.user.id);
    await writeAudit({
      actor: { id: g.ctx.user.id, email: g.ctx.user.email },
      action: "notification.resend",
      entity: "notification",
      entityId: p.data.id,
      after: sent,
      ...(await requestMeta()),
    });
    refresh();
    return { ok: true, message: `${purposeName(sent.purpose)} queued again.` };
  } catch (err) {
    if (err instanceof ResendError) return { ok: false, error: err.message };
    logger.error({ err }, "resending a message failed");
    return failed;
  }
}

export async function saveEventTemplatesAction(raw: unknown): Promise<NotificationActionResult> {
  const g = await checkStaff("settings.manage");
  if (!g.ok) return denied(g.status);
  const p = templateSaveInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  try {
    const { before } = await saveEventTemplates(p.data, g.ctx.user.id);
    const { event, ...after } = p.data;
    await writeAudit({
      actor: { id: g.ctx.user.id, email: g.ctx.user.email },
      action: "notifications.templates",
      entity: "settings",
      entityId: `notifications:${event}`,
      before,
      after,
      ...(await requestMeta()),
    });
    refresh();
    return { ok: true, message: `"${EVENT_INFO[event].name}" messages saved.` };
  } catch (err) {
    logger.error({ err }, "saving message templates failed");
    return failed;
  }
}

export async function saveMessageLanguageAction(raw: unknown): Promise<NotificationActionResult> {
  const g = await checkStaff("settings.manage");
  if (!g.ok) return denied(g.status);
  const p = languageInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  try {
    const { before } = await saveMessageLanguage(p.data.language, g.ctx.user.id);
    await writeAudit({
      actor: { id: g.ctx.user.id, email: g.ctx.user.email },
      action: "notifications.language",
      entity: "settings",
      entityId: "notifications",
      before: { language: before },
      after: { language: p.data.language },
      ...(await requestMeta()),
    });
    refresh();
    return {
      ok: true,
      message:
        p.data.language === "bn" ? "Customers now get messages in Bangla." : "Customers now get messages in English.",
    };
  } catch (err) {
    logger.error({ err }, "saving the message language failed");
    return failed;
  }
}
