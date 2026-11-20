"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/modules/audit/audit";
import { isRole } from "@/modules/auth/rbac";
import { checkStaff, requestMeta, type StaffContext } from "@/modules/auth/session";
import { findStaff, inviteSchema, inviteStaff, setStaffRole, setStaffStatus, signOutEverywhere } from "./staff";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const idSchema = z.string().min(1).max(64);

type Guarded = { error: string } | { ctx: StaffContext; meta: { ip: string | null; userAgent: string | null } };

async function guard(): Promise<Guarded> {
  const g = await checkStaff("staff.manage");
  if (!g.ok) return { error: g.status === 401 ? "Please sign in again." : "You do not have permission." };
  return { ctx: g.ctx, meta: await requestMeta() };
}

export async function inviteStaffAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const parsed = inviteSchema.safeParse({ name: form.get("name"), email: form.get("email"), role: form.get("role") });
  if (!parsed.success) return { ok: false, error: "Check the name, email and role." };

  const res = await inviteStaff(parsed.data);
  await writeAudit({
    actor: { id: g.ctx.user.id, email: g.ctx.user.email },
    action: "staff.invite",
    entity: "user",
    entityId: res.userId,
    after: { email: parsed.data.email, role: parsed.data.role, existed: res.existed },
    ...g.meta,
  });
  refresh();
  return { ok: true, message: `Invite sent to ${parsed.data.email}.` };
}

export async function changeRoleAction(userId: string, role: string): Promise<ActionResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  if (!idSchema.safeParse(userId).success || !isRole(role) || role === "customer")
    return { ok: false, error: "Invalid role." };
  if (userId === g.ctx.user.id) return { ok: false, error: "You cannot change your own role." };
  const target = await findStaff(userId);
  if (!target) return { ok: false, error: "User not found." };

  await setStaffRole(userId, role);
  await writeAudit({
    actor: { id: g.ctx.user.id, email: g.ctx.user.email },
    action: "staff.role_change",
    entity: "user",
    entityId: userId,
    before: { role: target.role },
    after: { role },
    ...g.meta,
  });
  refresh();
  return { ok: true };
}

export async function setStatusAction(userId: string, status: "active" | "blocked"): Promise<ActionResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  if (!idSchema.safeParse(userId).success || !["active", "blocked"].includes(status))
    return { ok: false, error: "Invalid request." };
  if (userId === g.ctx.user.id) return { ok: false, error: "You cannot block yourself." };
  const target = await findStaff(userId);
  if (!target) return { ok: false, error: "User not found." };

  await setStaffStatus(userId, status);
  await writeAudit({
    actor: { id: g.ctx.user.id, email: g.ctx.user.email },
    action: status === "blocked" ? "staff.block" : "staff.unblock",
    entity: "user",
    entityId: userId,
    before: { status: target.status ?? "active" },
    after: { status },
    ...g.meta,
  });
  refresh();
  return { ok: true };
}

export async function signOutEverywhereAction(userId: string): Promise<ActionResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  if (!idSchema.safeParse(userId).success) return { ok: false, error: "Invalid request." };

  await signOutEverywhere(userId);
  await writeAudit({
    actor: { id: g.ctx.user.id, email: g.ctx.user.email },
    action: "staff.force_sign_out",
    entity: "user",
    entityId: userId,
    ...g.meta,
  });
  refresh();
  return { ok: true };
}
