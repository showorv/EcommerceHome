"use server";

import { refresh } from "next/cache";
import { logger } from "@/lib/logger";
import { writeAudit } from "@/modules/audit/audit";
import { checkStaff, requestMeta } from "@/modules/auth/session";
import { getDeliveryConfig } from "@/modules/delivery/data";
import { orderRulesInput } from "./risk";
import { loadOrderRules, saveOrderRules } from "./rules-data";

/** Field names for the error message, so "At least 1" says which box. */
const LABELS: Record<string, string> = {
  reservationHours: "Hold stock for new orders",
  highValueAbove: "Large orders amount",
  pastProblemsAtLeast: "Past cancelled or returned orders",
  highScoreAtLeast: "High risk score",
  farZoneIds: "Far zones",
};

export type OrderRulesResult = { ok: true; message: string } | { ok: false; error: string };

/** Saves Admin → Order rules: settings.manage → zod → save → audit (FR-AD-08). */
export async function saveOrderRulesAction(raw: unknown): Promise<OrderRulesResult> {
  const g = await checkStaff("settings.manage");
  if (!g.ok) return { ok: false, error: g.status === 401 ? "Please sign in again." : "You do not have permission." };
  const parsed = orderRulesInput.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const label = issue ? LABELS[String(issue.path[0])] : undefined;
    return { ok: false, error: issue ? (label ? `${label}: ${issue.message}` : issue.message) : "Check the fields." };
  }
  try {
    const config = await getDeliveryConfig();
    const zoneIds = new Set(config.zones.map((z) => z.id));
    if (parsed.data.farZoneIds.some((id) => !zoneIds.has(id))) {
      return { ok: false, error: "A zone in the list no longer exists. Reload the page." };
    }
    const { rules: before } = await loadOrderRules(config.zones);
    await saveOrderRules(parsed.data, g.ctx.user.id);
    await writeAudit({
      actor: { id: g.ctx.user.id, email: g.ctx.user.email },
      action: "order_rules.update",
      entity: "settings",
      entityId: "orders",
      before,
      after: parsed.data,
      ...(await requestMeta()),
    });
    refresh();
    return { ok: true, message: "Order rules saved." };
  } catch (err) {
    logger.error({ err }, "saving order rules failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
