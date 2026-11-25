"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { writeAudit } from "@/modules/audit/audit";
import { checkStaff, requestMeta } from "@/modules/auth/session";
import { TAGS } from "@/modules/catalog/cache-tags";
import { refreshTags } from "@/modules/catalog/store-refresh";
import { rulesInput, zoneInput } from "./charge";
import {
  createZone,
  deleteZone,
  DeliveryError,
  saveArea,
  saveRules,
  setAreaActive,
  setAreaZone,
  setDistrictZone,
  updateZone,
} from "./data";

/**
 * Delivery admin actions (FR-AD-08). Every action: zones.manage → zod validation → change → audit log →
 * refresh the "delivery" tag (checkout and delivery previews read it).
 */

export type DeliveryResult<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: string };

const idSchema = z.string().regex(/^[a-f0-9]{24}$/i);
const nameSchema = z.object({
  en: z.string().trim().min(2, "Enter the area name in English").max(80),
  bn: z.string().trim().max(80).default(""),
});

type Change = { message: string; audit: string; entity: string; entityId: string; before?: unknown; after?: unknown };

async function run<T>(fn: () => Promise<Change & { data?: T }>): Promise<DeliveryResult<T>> {
  const g = await checkStaff("zones.manage");
  if (!g.ok) return { ok: false, error: g.status === 401 ? "Please sign in again." : "You do not have permission." };
  try {
    const res = await fn();
    await writeAudit({
      actor: { id: g.ctx.user.id, email: g.ctx.user.email },
      action: res.audit,
      entity: res.entity,
      entityId: res.entityId,
      before: res.before,
      after: res.after,
      ...(await requestMeta()),
    });
    refreshTags([TAGS.delivery]);
    refresh();
    return { ok: true, message: res.message, data: res.data };
  } catch (err) {
    if (err instanceof DeliveryError) return { ok: false, error: err.message };
    logger.error({ err }, "delivery action failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const first = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form.";
const badId = { ok: false, error: "Not found. Reload the page." } as const;

export async function saveZoneAction(id: string | null, raw: unknown): Promise<DeliveryResult<{ id: string }>> {
  if (id !== null && !idSchema.safeParse(id).success) return badId;
  const p = zoneInput.safeParse(raw);
  if (!p.success) return { ok: false, error: first(p.error) };
  return run(async () => {
    if (id === null) {
      const zone = await createZone(p.data);
      return {
        message: `${zone.name} added.`,
        audit: "delivery.zone.create",
        entity: "deliveryZone",
        entityId: zone.id,
        after: zone,
        data: { id: zone.id },
      };
    }
    const { before, after } = await updateZone(id, p.data);
    return {
      message: `${after.name} saved.`,
      audit: "delivery.zone.update",
      entity: "deliveryZone",
      entityId: id,
      before,
      after,
      data: { id },
    };
  });
}

export async function deleteZoneAction(id: string): Promise<DeliveryResult> {
  if (!idSchema.safeParse(id).success) return badId;
  return run(async () => {
    const before = await deleteZone(id);
    return {
      message: `${before.name} deleted.`,
      audit: "delivery.zone.delete",
      entity: "deliveryZone",
      entityId: id,
      before,
    };
  });
}

export async function setDistrictZoneAction(
  districtId: string,
  zoneId: string,
  resetAreas: boolean,
): Promise<DeliveryResult> {
  if (!idSchema.safeParse(districtId).success || !idSchema.safeParse(zoneId).success) return badId;
  return run(async () => {
    const r = await setDistrictZone(districtId, zoneId, resetAreas === true);
    return {
      message: resetAreas ? `${r.district} and all its areas moved.` : `${r.district} moved.`,
      audit: "delivery.district.zone",
      entity: "location",
      entityId: districtId,
      before: { zoneId: r.before },
      after: { zoneId, resetAreas: resetAreas === true },
    };
  });
}

/** zoneId null = the area follows its district. */
export async function setAreaZoneAction(areaId: string, zoneId: string | null): Promise<DeliveryResult> {
  if (!idSchema.safeParse(areaId).success) return badId;
  if (zoneId !== null && !idSchema.safeParse(zoneId).success) return badId;
  return run(async () => {
    const r = await setAreaZone(areaId, zoneId);
    return {
      message: zoneId ? `${r.area} has its own zone now.` : `${r.area} follows its district again.`,
      audit: "delivery.area.zone",
      entity: "location",
      entityId: areaId,
      before: { zoneId: r.before },
      after: { zoneId },
    };
  });
}

export async function setAreaActiveAction(areaId: string, active: boolean): Promise<DeliveryResult> {
  if (!idSchema.safeParse(areaId).success || typeof active !== "boolean") return badId;
  return run(async () => {
    const r = await setAreaActive(areaId, active);
    return {
      message: active ? `Delivering to ${r.area} again.` : `${r.area} switched off. Shoppers can't pick it.`,
      audit: active ? "delivery.area.enable" : "delivery.area.disable",
      entity: "location",
      entityId: areaId,
      after: { active },
    };
  });
}

export async function saveAreaAction(
  id: string | null,
  districtId: string,
  raw: unknown,
): Promise<DeliveryResult<{ id: string }>> {
  if ((id !== null && !idSchema.safeParse(id).success) || !idSchema.safeParse(districtId).success) return badId;
  const p = nameSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: first(p.error) };
  return run(async () => {
    const r = await saveArea(id, districtId, p.data);
    return {
      message: id ? `Renamed to ${p.data.en}.` : `${p.data.en} added.`,
      audit: id ? "delivery.area.rename" : "delivery.area.create",
      entity: "location",
      entityId: r.id,
      before: r.before ?? undefined,
      after: { name: p.data, districtId },
      data: { id: r.id },
    };
  });
}

export async function saveRulesAction(raw: unknown): Promise<DeliveryResult> {
  const p = rulesInput.safeParse(raw);
  if (!p.success) return { ok: false, error: first(p.error) };
  return run(async () => {
    const { before } = await saveRules(p.data);
    return {
      message: "Delivery rules saved.",
      audit: "delivery.rules.update",
      entity: "deliveryRules",
      entityId: "store",
      before,
      after: p.data,
    };
  });
}
