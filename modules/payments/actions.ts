"use server";

import { refresh } from "next/cache";
import { logger } from "@/lib/logger";
import { writeAudit } from "@/modules/audit/audit";
import { checkStaff, requestMeta } from "@/modules/auth/session";
import { TAGS } from "@/modules/catalog/cache-tags";
import { refreshTags } from "@/modules/catalog/store-refresh";
import { savePaymentSettings } from "./data";
import { paymentSettingsInput } from "./payments";

export type PaymentSettingsResult = { ok: true; message: string } | { ok: false; error: string };

/** Saves the receiving wallets: settings.manage → zod → save → audit → refresh checkout. */
export async function savePaymentSettingsAction(raw: unknown): Promise<PaymentSettingsResult> {
  const g = await checkStaff("settings.manage");
  if (!g.ok) return { ok: false, error: g.status === 401 ? "Please sign in again." : "You do not have permission." };
  const parsed = paymentSettingsInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields." };
  try {
    const { before, after } = await savePaymentSettings(parsed.data, g.ctx.user.id);
    await writeAudit({
      actor: { id: g.ctx.user.id, email: g.ctx.user.email },
      action: "payments.update",
      entity: "settings",
      entityId: "payments",
      before,
      after,
      ...(await requestMeta()),
    });
    refreshTags([TAGS.payments]);
    refresh();
    return { ok: true, message: "Payment settings saved." };
  } catch (err) {
    logger.error({ err }, "saving payment settings failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
