"use server";

import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { connectMongoose } from "@/lib/db/mongo";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";
import { writeAudit } from "@/modules/audit/audit";
import type { Permission } from "@/modules/auth/rbac";
import { checkStaff, requestMeta } from "@/modules/auth/session";
import { TAGS } from "@/modules/catalog/cache-tags";
import { NewsletterSubscriber } from "./models";
import {
  cancelSchedule,
  discardDraft,
  isBuilderPage,
  PageError,
  publishNow,
  saveDraft,
  schedulePublish,
  type PageState,
} from "./pages";
import { dhakaInputToIso, sectionsInput, type Section } from "./sections";

/**
 * Storefront builder actions (FR-AD-07). Editing the draft needs cms.edit; making it live (now or
 * scheduled) needs cms.publish. Every change is audited; publishing refreshes the live page's cache.
 */

export type BuilderResult = { ok: true; page: PageState; message: string } | { ok: false; error: string };

const versionSchema = z.number().int().min(0);

async function guarded(
  permission: Permission,
  slug: string,
  fn: (actor: {
    id: string;
    email: string;
  }) => Promise<{ page: PageState; message: string; audit: string; detail?: unknown }>,
): Promise<BuilderResult> {
  const g = await checkStaff(permission);
  if (!g.ok) return { ok: false, error: g.status === 401 ? "Please sign in again." : "You do not have permission." };
  if (!isBuilderPage(slug)) return { ok: false, error: "Unknown page." };
  try {
    const actor = { id: g.ctx.user.id, email: g.ctx.user.email };
    const res = await fn(actor);
    await writeAudit({
      actor,
      action: res.audit,
      entity: "page",
      entityId: slug,
      after: res.detail ?? { version: res.page.version },
      ...(await requestMeta()),
    });
    return { ok: true, page: res.page, message: res.message };
  } catch (err) {
    if (err instanceof PageError) return { ok: false, error: err.message };
    logger.error({ err }, "storefront builder action failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

type Parsed = { error: string } | { error?: undefined; sections: Section[]; version: number };

function parse(raw: unknown, version: unknown): Parsed {
  const s = sectionsInput.safeParse(raw);
  if (!s.success) return { error: s.error.issues[0]?.message ?? "Check the sections." };
  const v = versionSchema.safeParse(version);
  if (!v.success) return { error: "Reload the page and try again." };
  return { sections: s.data, version: v.data };
}

export async function saveDraftAction(slug: string, sections: unknown, version: unknown): Promise<BuilderResult> {
  const p = parse(sections, version);
  if (p.error !== undefined) return { ok: false, error: p.error };
  return guarded("cms.edit", slug, async (a) => ({
    page: await saveDraft(slug as "home", p.sections, p.version, a.id),
    message: "Draft saved.",
    audit: "page.draft.save",
  }));
}

export async function publishAction(slug: string, sections: unknown, version: unknown): Promise<BuilderResult> {
  const p = parse(sections, version);
  if (p.error !== undefined) return { ok: false, error: p.error };
  return guarded("cms.publish", slug, async (a) => {
    const page = await publishNow(slug as "home", p.sections, p.version, a.id);
    updateTag(TAGS.page(slug));
    return {
      page,
      message: "Published. The store shows it now.",
      audit: "page.publish",
      detail: { sections: p.sections },
    };
  });
}

export async function scheduleAction(
  slug: string,
  sections: unknown,
  version: unknown,
  when: string,
): Promise<BuilderResult> {
  const p = parse(sections, version);
  if (p.error !== undefined) return { ok: false, error: p.error };
  const iso = dhakaInputToIso(String(when));
  if (!iso) return { ok: false, error: "Pick a date and time." };
  return guarded("cms.publish", slug, async (a) => {
    const page = await schedulePublish(slug as "home", p.sections, new Date(iso), p.version, a.id);
    updateTag(TAGS.page(slug));
    return { page, message: "Scheduled.", audit: "page.schedule", detail: { at: iso, sections: p.sections } };
  });
}

export async function cancelScheduleAction(slug: string, version: unknown): Promise<BuilderResult> {
  const v = versionSchema.safeParse(version);
  if (!v.success) return { ok: false, error: "Reload the page and try again." };
  return guarded("cms.publish", slug, async () => {
    const page = await cancelSchedule(slug as "home", v.data);
    updateTag(TAGS.page(slug));
    return { page, message: "Schedule cancelled.", audit: "page.schedule.cancel" };
  });
}

export async function discardDraftAction(slug: string, version: unknown): Promise<BuilderResult> {
  const v = versionSchema.safeParse(version);
  if (!v.success) return { ok: false, error: "Reload the page and try again." };
  return guarded("cms.edit", slug, async (a) => ({
    page: await discardDraft(slug as "home", v.data, a.id),
    message: "Changes thrown away.",
    audit: "page.draft.discard",
  }));
}

// ---------- Newsletter (public) ----------

export type SubscribeState = { status: "idle" | "ok" | "error"; message: string };

const emailSchema = z.email().max(254);

/** Newsletter sign-up from the store. Rate-limited per IP; signing up twice is not an error. */
export async function subscribeAction(_prev: SubscribeState, form: FormData): Promise<SubscribeState> {
  const email = emailSchema.safeParse(
    String(form.get("email") ?? "")
      .trim()
      .toLowerCase(),
  );
  if (!email.success) return { status: "error", message: "Please enter a valid email address." };
  // Bots fill every field; people never see this one.
  if (String(form.get("company") ?? "") !== "") return { status: "ok", message: "Thanks! You're on the list." };
  try {
    const h = await headers();
    const ip =
      h
        .get(process.env.CLIENT_IP_HEADER ?? "x-forwarded-for")
        ?.split(",")[0]
        ?.trim() || "unknown";
    const limit = await rateLimit(redis(), `newsletter:ip:${ip}`, 5, 3600);
    if (!limit.allowed) return { status: "error", message: "Too many sign-ups from here. Please try again later." };
    await connectMongoose();
    await NewsletterSubscriber.updateOne(
      { email: email.data },
      { $setOnInsert: { email: email.data, source: "home" }, $set: { unsubscribedAt: null } },
      { upsert: true },
    );
    return { status: "ok", message: "Thanks! You're on the list." };
  } catch (err) {
    logger.error({ err }, "newsletter sign-up failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }
}
