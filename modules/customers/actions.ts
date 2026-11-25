"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { writeAudit } from "@/modules/audit/audit";
import { checkStaff, requestMeta } from "@/modules/auth/session";
import { BLOCK_KINDS, blockInput } from "./blocks";
import { addBlocked, BlockError, removeBlocked, updateBlocked } from "./data";

/** Blocked and flagged numbers (FR-AD-06): customers.block → zod → save → audit. */

export type BlockResult = { ok: true; message: string } | { ok: false; error: string };

const id = z.string().regex(/^[a-f0-9]{24}$/i);
const changeInput = z.object({ id, kind: z.enum(BLOCK_KINDS), reason: blockInput.shape.reason });

async function guard() {
  const g = await checkStaff("customers.block");
  if (!g.ok) return { error: g.status === 401 ? "Please sign in again." : "You do not have permission." } as const;
  return { g, meta: await requestMeta() } as const;
}

async function run(work: () => Promise<string>): Promise<BlockResult> {
  try {
    const message = await work();
    refresh();
    return { ok: true, message };
  } catch (err) {
    if (err instanceof BlockError) return { ok: false, error: err.message };
    logger.error({ err }, "blocked numbers change failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const shown = (phone: string) => phone.replace(/^\+88/, "");

export async function addBlockedAction(raw: unknown): Promise<BlockResult> {
  const a = await guard();
  if ("error" in a) return { ok: false, error: a.error! };
  const parsed = blockInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields." };
  return run(async () => {
    const { user } = a.g.ctx;
    const row = await addBlocked(parsed.data, { id: user.id, name: user.name || user.email });
    await writeAudit({
      actor: { id: user.id, email: user.email },
      action: row.kind === "block" ? "contact.block" : "contact.flag",
      entity: "blockedContact",
      entityId: row.id,
      after: row,
      ...a.meta,
    });
    return `${shown(row.phone)} ${row.kind === "block" ? "blocked" : "flagged"}.`;
  });
}

export async function updateBlockedAction(raw: unknown): Promise<BlockResult> {
  const a = await guard();
  if ("error" in a) return { ok: false, error: a.error! };
  const parsed = changeInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields." };
  return run(async () => {
    const { before, after } = await updateBlocked(parsed.data.id, {
      kind: parsed.data.kind,
      reason: parsed.data.reason,
    });
    await writeAudit({
      actor: { id: a.g.ctx.user.id, email: a.g.ctx.user.email },
      action: "contact.update",
      entity: "blockedContact",
      entityId: parsed.data.id,
      before,
      after,
      ...a.meta,
    });
    return `${shown(after.phone)} saved.`;
  });
}

export async function removeBlockedAction(rawId: unknown): Promise<BlockResult> {
  const a = await guard();
  if ("error" in a) return { ok: false, error: a.error! };
  const parsed = id.safeParse(rawId);
  if (!parsed.success) return { ok: false, error: "Reload the page and try again." };
  return run(async () => {
    const row = await removeBlocked(parsed.data);
    await writeAudit({
      actor: { id: a.g.ctx.user.id, email: a.g.ctx.user.email },
      action: "contact.unblock",
      entity: "blockedContact",
      entityId: row.id,
      before: row,
      ...a.meta,
    });
    return `${shown(row.phone)} removed from the list.`;
  });
}
