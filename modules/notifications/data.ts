// Not server-only: send.ts uses it, and scripts reach send.ts through modules/auth/auth.ts.
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { Setting } from "@/modules/payments/models";
import { Notification, NotificationTemplate } from "./models";
import {
  CHANNELS,
  DEFAULT_TEMPLATES,
  EVENTS,
  LANGUAGES,
  NOTIFICATION_STATUSES,
  readNotificationSettings,
  type Channel,
  type EventTemplates,
  type Language,
  type NotificationEvent,
  type NotificationSettings,
  type NotificationStatus,
  type TemplateSave,
} from "./templates";

/** Message settings, templates and the log, for the app and admin (FR-OR-06/07). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

const SETTING_ID = "notifications";

export async function loadNotificationSettings(): Promise<NotificationSettings> {
  await connectMongoose();
  const s = await Setting.findById(SETTING_ID).lean<AnyDoc>();
  return readNotificationSettings(s?.value);
}

/** Every event's texts: the saved ones, the defaults for the rest. */
export async function loadAllTemplates(): Promise<Record<NotificationEvent, EventTemplates>> {
  await connectMongoose();
  const saved = await NotificationTemplate.find({}).lean<AnyDoc[]>();
  const out = structuredClone(DEFAULT_TEMPLATES);
  for (const t of saved) {
    const e = t.event as NotificationEvent;
    const l = t.language as Language;
    if (!EVENTS.includes(e) || !LANGUAGES.includes(l)) continue;
    if (t.channel === "sms") out[e].sms[l] = String(t.body);
    else if (t.channel === "email") out[e].email[l] = { subject: String(t.subject), body: String(t.body) };
  }
  return out;
}

export async function loadEventTemplates(event: NotificationEvent): Promise<EventTemplates> {
  await connectMongoose();
  const saved = await NotificationTemplate.find({ event }).lean<AnyDoc[]>();
  const out = structuredClone(DEFAULT_TEMPLATES[event]);
  for (const t of saved) {
    const l = t.language as Language;
    if (!LANGUAGES.includes(l)) continue;
    if (t.channel === "sms") out.sms[l] = String(t.body);
    else if (t.channel === "email") out.email[l] = { subject: String(t.subject), body: String(t.body) };
  }
  return out;
}

/** One event's texts and on/off switches. Returns what was there before, for the audit log. */
export async function saveEventTemplates(
  v: TemplateSave,
  by: string,
): Promise<{ before: { enabled: Record<Channel, boolean>; templates: EventTemplates } }> {
  const [settings, templates] = await Promise.all([loadNotificationSettings(), loadEventTemplates(v.event)]);
  const before = { enabled: settings.enabled[v.event], templates };
  const ops = LANGUAGES.flatMap((language) => [
    {
      updateOne: {
        filter: { event: v.event, channel: "sms", language },
        update: { $set: { subject: "", body: v.sms[language], updatedBy: by } },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { event: v.event, channel: "email", language },
        update: { $set: { subject: v.email[language].subject, body: v.email[language].body, updatedBy: by } },
        upsert: true,
      },
    },
  ]);
  await NotificationTemplate.bulkWrite(ops);
  const enabled = { ...settings.enabled, [v.event]: v.enabled };
  await Setting.updateOne(
    { _id: SETTING_ID },
    { $set: { value: { ...settings, enabled }, updatedBy: by } },
    { upsert: true },
  );
  return { before };
}

export async function saveMessageLanguage(language: Language, by: string): Promise<{ before: Language }> {
  const settings = await loadNotificationSettings();
  await Setting.updateOne(
    { _id: SETTING_ID },
    { $set: { value: { ...settings, language }, updatedBy: by } },
    { upsert: true },
  );
  return { before: settings.language };
}

// ---------- The log ----------

export type LogRow = {
  id: string;
  channel: Channel;
  to: string;
  purpose: string;
  orderNo: string | null;
  subject: string;
  text: string;
  private: boolean;
  status: NotificationStatus;
  attempts: number;
  error: string | null;
  provider: string | null;
  createdAt: string;
  sentAt: string | null;
  resends: number;
};

function toRow(d: AnyDoc): LogRow {
  return {
    id: String(d._id),
    channel: d.channel,
    to: String(d.to),
    purpose: String(d.purpose),
    orderNo: d.orderNo ?? null,
    subject: String(d.subject ?? ""),
    text: String(d.text ?? ""),
    private: !!d.private,
    status: d.status,
    attempts: Number(d.attempts ?? 0),
    error: d.error ?? null,
    provider: d.provider ?? null,
    createdAt: new Date(d.createdAt).toISOString(),
    sentAt: d.sentAt ? new Date(d.sentAt).toISOString() : null,
    resends: Number(d.resends ?? 0),
  };
}

export const LOG_PAGE_SIZE = 50;

export type LogFilters = { status: NotificationStatus | "all"; channel: Channel | "all"; q: string; page: number };

export function readLogFilters(sp: Record<string, string | string[] | undefined>): LogFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const status = one("status");
  const channel = one("channel");
  const page = Number.parseInt(one("page"), 10);
  return {
    status: NOTIFICATION_STATUSES.includes(status as NotificationStatus) ? (status as NotificationStatus) : "all",
    channel: CHANNELS.includes(channel as Channel) ? (channel as Channel) : "all",
    q: one("q").trim().slice(0, 60),
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 1000) : 1,
  };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listNotifications(f: LogFilters): Promise<{ rows: LogRow[]; total: number; failed: number }> {
  await connectMongoose();
  const filter: AnyDoc = {};
  if (f.status !== "all") filter.status = f.status;
  if (f.channel !== "all") filter.channel = f.channel;
  if (f.q) {
    // A phone number (with or without 0/+880), an order number or an email address.
    const digits = f.q.replace(/\D/g, "");
    const or: AnyDoc[] = [{ orderNo: f.q.toUpperCase() }, { to: { $regex: escapeRe(f.q), $options: "i" } }];
    if (digits.length >= 6) or.push({ to: { $regex: `${escapeRe(digits.replace(/^0/, ""))}$` } });
    filter.$or = or;
  }
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [rows, total, failed] = await Promise.all([
    Notification.find(trustFilter(filter))
      .sort({ createdAt: -1 })
      .skip((f.page - 1) * LOG_PAGE_SIZE)
      .limit(LOG_PAGE_SIZE)
      .lean<AnyDoc[]>(),
    Notification.countDocuments(trustFilter(filter)),
    Notification.countDocuments(trustFilter({ status: "failed", createdAt: { $gte: since } })),
  ]);
  return { rows: rows.map(toRow), total, failed };
}

/** The messages sent about one order, newest first. */
export async function orderNotifications(orderId: string): Promise<LogRow[]> {
  await connectMongoose();
  const rows = await Notification.find({ orderId }).sort({ createdAt: -1 }).limit(50).lean<AnyDoc[]>();
  return rows.map(toRow);
}
