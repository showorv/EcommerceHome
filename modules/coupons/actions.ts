"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { writeAudit } from "@/modules/audit/audit";
import { checkStaff, requestMeta } from "@/modules/auth/session";
import { couponInput } from "./coupons";
import { createCoupon, CouponError, deleteCoupon, setCouponActive, updateCoupon } from "./data";

/** Coupon admin actions (FR-CO-04): coupons.manage → zod → change → audit log. */

export type CouponAdminResult = { ok: true; message: string } | { ok: false; error: string };

const idSchema = z.string().regex(/^[a-f0-9]{24}$/i);

type Change = { message: string; audit: string; entityId: string; before?: unknown; after?: unknown };

async function run(fn: (by: string) => Promise<Change>): Promise<CouponAdminResult> {
  const g = await checkStaff("coupons.manage");
  if (!g.ok) return { ok: false, error: g.status === 401 ? "Please sign in again." : "You do not have permission." };
  try {
    const res = await fn(g.ctx.user.id);
    await writeAudit({
      actor: { id: g.ctx.user.id, email: g.ctx.user.email },
      action: res.audit,
      entity: "coupon",
      entityId: res.entityId,
      before: res.before,
      after: res.after,
      ...(await requestMeta()),
    });
    refresh();
    return { ok: true, message: res.message };
  } catch (err) {
    if (err instanceof CouponError) return { ok: false, error: err.message };
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Check the fields." };
    logger.error({ err }, "coupon action failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function saveCouponAction(id: string | null, raw: unknown): Promise<CouponAdminResult> {
  return run(async (by) => {
    const input = couponInput.parse(raw);
    if (id === null) {
      const c = await createCoupon(input, by);
      return { message: `Coupon ${c.code} created.`, audit: "coupon.create", entityId: c.id, after: c };
    }
    const cid = idSchema.parse(id);
    const { before, after } = await updateCoupon(cid, input);
    return { message: `Coupon ${after.code} saved.`, audit: "coupon.update", entityId: cid, before, after };
  });
}

export async function setCouponActiveAction(id: string, active: boolean): Promise<CouponAdminResult> {
  return run(async () => {
    const cid = idSchema.parse(id);
    const { before, after } = await setCouponActive(cid, z.boolean().parse(active));
    return {
      message: `${after.code} is ${active ? "on" : "off"}.`,
      audit: active ? "coupon.activate" : "coupon.deactivate",
      entityId: cid,
      before: { active: before.active },
      after: { active: after.active },
    };
  });
}

export async function deleteCouponAction(id: string): Promise<CouponAdminResult> {
  return run(async () => {
    const cid = idSchema.parse(id);
    const c = await deleteCoupon(cid);
    return { message: `Coupon ${c.code} deleted.`, audit: "coupon.delete", entityId: cid, before: c };
  });
}
