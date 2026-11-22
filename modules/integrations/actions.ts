"use server";

import { refresh } from "next/cache";
import { logger } from "@/lib/logger";
import { writeAudit } from "@/modules/audit/audit";
import { TAGS } from "@/modules/catalog/cache-tags";
import { refreshTags } from "@/modules/catalog/store-refresh";
import { checkStaff, requestMeta } from "@/modules/auth/session";
import { defOf, integrationInput } from "./integrations";
import { saveIntegration } from "./store";

export type IntegrationResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Saves one integration: integrations.manage → zod → encrypt and save → audit (secrets only as their
 * masks) → refresh the page. The worker picks the change up within 30 seconds.
 */
export async function saveIntegrationAction(raw: unknown): Promise<IntegrationResult> {
  const g = await checkStaff("integrations.manage");
  if (!g.ok) return { ok: false, error: g.status === 401 ? "Please sign in again." : "You do not have permission." };
  const parsed = integrationInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields." };
  try {
    const res = await saveIntegration(parsed.data, { id: g.ctx.user.id, name: g.ctx.user.name });
    if (!res.ok) return res;
    await writeAudit({
      actor: { id: g.ctx.user.id, email: g.ctx.user.email },
      action: "integrations.update",
      entity: "settings",
      entityId: `integrations.${parsed.data.id}`,
      before: res.before,
      after: res.after,
      ...(await requestMeta()),
    });
    // Tracking IDs are in every store page: those pages are rebuilt with the new ones.
    if (parsed.data.id === "analytics") refreshTags([TAGS.analytics]);
    refresh();
    return { ok: true, message: `${defOf(parsed.data.id).title} settings saved.` };
  } catch (err) {
    logger.error({ err, integration: parsed.data.id }, "saving integration settings failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
