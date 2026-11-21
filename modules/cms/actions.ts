"use server";

import { isValidObjectId } from "mongoose";
import { updateTag } from "next/cache";
import { z } from "zod";
import { connectMongoose } from "@/lib/db/mongo";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";
import { writeAudit } from "@/modules/audit/audit";
import type { Permission } from "@/modules/auth/rbac";
import { checkStaff, requestMeta } from "@/modules/auth/session";
import { TAGS } from "@/modules/catalog/cache-tags";
import { cmsContentInput, contactInput, type CmsContent } from "./blocks";
import { ContactMessage } from "./models";
import {
  CmsError,
  createPage,
  deletePage,
  discardDraft,
  publish,
  saveDraft,
  unpublish,
  type CmsPageState,
} from "./pages";

/**
 * CMS page actions (FR-SF-09). Editing drafts needs cms.edit; publishing, unpublishing and deleting need
 * cms.publish. Every change is audited; anything that changes the store refreshes its cache tags.
 */

export type CmsResult = { ok: true; page: CmsPageState; message: string } | { ok: false; error: string };

const versionSchema = z.number().int().min(0);
type Actor = { id: string; email: string };

async function audited(
  permission: Permission,
  entityId: string,
  fn: (
    actor: Actor,
  ) => Promise<{ page: CmsPageState; message: string; audit: string; detail?: unknown; before?: unknown }>,
): Promise<CmsResult> {
  const g = await checkStaff(permission);
  if (!g.ok) return { ok: false, error: g.status === 401 ? "Please sign in again." : "You do not have permission." };
  try {
    const actor = { id: g.ctx.user.id, email: g.ctx.user.email };
    const res = await fn(actor);
    await writeAudit({
      actor,
      action: res.audit,
      entity: "cmsPage",
      entityId: entityId || res.page.id,
      before: res.before,
      after: res.detail ?? { version: res.page.version },
      ...(await requestMeta()),
    });
    return { ok: true, page: res.page, message: res.message };
  } catch (err) {
    if (err instanceof CmsError) return { ok: false, error: err.message };
    logger.error({ err }, "cms action failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

type Parsed = { error: string } | { error?: undefined; content: CmsContent; version: number };

function parse(raw: unknown, version: unknown): Parsed {
  const c = cmsContentInput.safeParse(raw);
  if (!c.success) return { error: c.error.issues[0]?.message ?? "Check the page." };
  const v = versionSchema.safeParse(version);
  if (!v.success) return { error: "Reload the page and try again." };
  return { content: c.data, version: v.data };
}

const badId = { ok: false, error: "Page not found." } as const;

export async function createPageAction(raw: unknown): Promise<CmsResult> {
  const p = parse(raw, 0);
  if (p.error !== undefined) return { ok: false, error: p.error };
  return audited("cms.edit", "", async (a) => {
    const page = await createPage(p.content, a.id);
    return { page, message: "Page created.", audit: "cms.page.create", detail: { slug: page.slug } };
  });
}

export async function saveCmsDraftAction(id: string, raw: unknown, version: unknown): Promise<CmsResult> {
  if (!isValidObjectId(id)) return badId;
  const p = parse(raw, version);
  if (p.error !== undefined) return { ok: false, error: p.error };
  return audited("cms.edit", id, async (a) => ({
    page: await saveDraft(id, p.content, p.version, a.id),
    message: "Draft saved.",
    audit: "cms.page.draft.save",
  }));
}

export async function publishCmsPageAction(id: string, raw: unknown, version: unknown): Promise<CmsResult> {
  if (!isValidObjectId(id)) return badId;
  const p = parse(raw, version);
  if (p.error !== undefined) return { ok: false, error: p.error };
  return audited("cms.publish", id, async (a) => {
    const { page, previousSlug } = await publish(id, p.content, p.version, a.id);
    updateTag(TAGS.cmsPage(page.slug));
    if (previousSlug !== page.slug) updateTag(TAGS.cmsPage(previousSlug));
    updateTag(TAGS.cmsPages);
    return {
      page,
      message: `Published. The store shows it at /pages/${page.slug}.`,
      audit: "cms.page.publish",
      detail: p.content,
    };
  });
}

export async function unpublishCmsPageAction(id: string, version: unknown): Promise<CmsResult> {
  if (!isValidObjectId(id)) return badId;
  const v = versionSchema.safeParse(version);
  if (!v.success) return { ok: false, error: "Reload the page and try again." };
  return audited("cms.publish", id, async () => {
    const page = await unpublish(id, v.data);
    updateTag(TAGS.cmsPage(page.slug));
    updateTag(TAGS.cmsPages);
    return { page, message: "Taken off the store. The draft is kept.", audit: "cms.page.unpublish" };
  });
}

export async function discardCmsDraftAction(id: string, version: unknown): Promise<CmsResult> {
  if (!isValidObjectId(id)) return badId;
  const v = versionSchema.safeParse(version);
  if (!v.success) return { ok: false, error: "Reload the page and try again." };
  return audited("cms.edit", id, async (a) => ({
    page: await discardDraft(id, v.data, a.id),
    message: "Changes thrown away.",
    audit: "cms.page.draft.discard",
  }));
}

export async function deleteCmsPageAction(id: string, version: unknown): Promise<CmsResult> {
  if (!isValidObjectId(id)) return badId;
  const v = versionSchema.safeParse(version);
  if (!v.success) return { ok: false, error: "Reload the page and try again." };
  return audited("cms.publish", id, async () => {
    const page = await deletePage(id, v.data);
    if (page.published) {
      updateTag(TAGS.cmsPage(page.slug));
      updateTag(TAGS.cmsPages);
    }
    // The audit entry keeps a full copy, so a deleted page can be rebuilt if needed.
    return { page, message: "Page deleted.", audit: "cms.page.delete", before: page, detail: { deleted: true } };
  });
}

// ---------- Contact form (public) ----------

export type ContactState = {
  status: "idle" | "ok" | "error";
  message: string;
  fieldErrors?: Partial<Record<"name" | "phone" | "email" | "message", string>>;
  /** What the shopper typed, so a failed send doesn't wipe the form. */
  values?: Record<string, string>;
};

export async function sendContactAction(_prev: ContactState, form: FormData): Promise<ContactState> {
  const values = {
    name: String(form.get("name") ?? ""),
    phone: String(form.get("phone") ?? ""),
    email: String(form.get("email") ?? ""),
    message: String(form.get("message") ?? ""),
  };
  const ok: ContactState = { status: "ok", message: "Thanks! We got your message and will reply soon." };
  // Bots fill every field; people never see this one.
  if (String(form.get("company") ?? "") !== "") return ok;

  const parsed = contactInput.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: ContactState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<ContactState["fieldErrors"]>;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", message: "Please check the form.", fieldErrors, values };
  }
  try {
    const { ip } = await requestMeta();
    const limit = await rateLimit(redis(), `contact:ip:${ip ?? "unknown"}`, 5, 3600);
    if (!limit.allowed) {
      return { status: "error", message: "Too many messages from here. Please try again later or call us.", values };
    }
    await connectMongoose();
    const page = String(form.get("page") ?? "").slice(0, 60);
    await ContactMessage.create({ ...parsed.data, page });
    return ok;
  } catch (err) {
    logger.error({ err }, "contact message failed");
    return { status: "error", message: "Something went wrong. Please try again or call us.", values };
  }
}

// ---------- Contact messages (admin) ----------

export async function setMessageHandledAction(
  id: string,
  handled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidObjectId(id)) return { ok: false, error: "Message not found." };
  const g = await checkStaff("customers.view");
  if (!g.ok) return { ok: false, error: g.status === 401 ? "Please sign in again." : "You do not have permission." };
  try {
    await connectMongoose();
    const actor = { id: g.ctx.user.id, email: g.ctx.user.email };
    const res = await ContactMessage.updateOne(
      { _id: id },
      { $set: handled ? { handledAt: new Date(), handledBy: actor.id } : { handledAt: null, handledBy: null } },
    );
    if (res.matchedCount === 0) return { ok: false, error: "Message not found." };
    await writeAudit({
      actor,
      action: handled ? "contact.handled" : "contact.reopened",
      entity: "contactMessage",
      entityId: id,
      ...(await requestMeta()),
    });
    return { ok: true };
  } catch (err) {
    logger.error({ err }, "contact handled update failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
