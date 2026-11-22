import { decrypt, encrypt } from "@/lib/crypto";
import { connectMongoose } from "@/lib/db/mongo";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { Setting } from "@/modules/payments/models";
import {
  checkIntegration,
  EMPTY_INTEGRATION,
  INTEGRATIONS,
  maskValue,
  plainKeys,
  readStored,
  secretKeys,
  type IntegrationId,
  type IntegrationInput,
  type IntegrationView,
  type Source,
  type StoredIntegration,
} from "./integrations";

/**
 * Integration keys (FR-AD-12, NFR-SEC-13): stored in settings/"integrations", secrets encrypted with
 * ENCRYPTION_KEY. Used by the web app and the worker (so no "server-only"); callers check
 * integrations.manage before saving. Reads are kept for 30 seconds, so the worker picks up a change
 * within half a minute.
 */

const KEY = "integrations";
const TTL_MS = 30_000;

type AllStored = Record<IntegrationId, StoredIntegration>;
let cache: { at: number; all: AllStored } | undefined;

async function loadAll(): Promise<AllStored> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.all;
  await connectMongoose();
  const doc = await Setting.findById(KEY).lean<{ value?: Record<string, unknown> }>();
  const all = Object.fromEntries(INTEGRATIONS.map((id) => [id, readStored(id, doc?.value?.[id])])) as AllStored;
  cache = { at: Date.now(), all };
  return all;
}

/** Drops the 30-second copy (after a save in this process, and in tests). */
export function forgetIntegrations() {
  cache = undefined;
}

/** A stored secret in plain text, or null when missing or unreadable (e.g. ENCRYPTION_KEY changed). */
function open(id: IntegrationId, s: StoredIntegration, key: string): string | null {
  const c = s.secrets[key];
  if (!c) return null;
  try {
    return decrypt(c, env().ENCRYPTION_KEY);
  } catch {
    logger.warn(
      { integration: id, field: key },
      "a saved integration key can't be decrypted (was ENCRYPTION_KEY changed?)",
    );
    return null;
  }
}

// ---------- What the senders use ----------

export type SmsSettings = {
  source: Source;
  provider: "console" | "alpha";
  fallback: "console" | "alpha" | null;
  alphaApiKey: string | null;
  senderId: string | null;
};

export async function smsSettings(): Promise<SmsSettings> {
  const s = (await loadAll()).sms;
  if (s.source === "admin") {
    const v = s.values;
    return {
      source: "admin",
      provider: v.provider === "alpha" ? "alpha" : "console",
      fallback: v.fallback === "alpha" || v.fallback === "console" ? v.fallback : null,
      alphaApiKey: open("sms", s, "alphaApiKey"),
      senderId: v.senderId || null,
    };
  }
  const e = env();
  return {
    source: "env",
    provider: e.SMS_PROVIDER,
    fallback: e.SMS_FALLBACK_PROVIDER ?? null,
    alphaApiKey: e.ALPHA_SMS_API_KEY ?? null,
    senderId: e.SMS_SENDER_ID ?? null,
  };
}

export type EmailSettings = {
  source: Source;
  provider: "smtp" | "resend";
  from: string;
  smtp: { host: string; port: number; user: string | null; pass: string | null };
  resendApiKey: string | null;
};

export async function emailSettings(): Promise<EmailSettings> {
  const s = (await loadAll()).email;
  if (s.source === "admin") {
    const v = s.values;
    return {
      source: "admin",
      provider: v.provider === "resend" ? "resend" : "smtp",
      from: v.from ?? "",
      smtp: {
        host: v.smtpHost ?? "",
        port: Number(v.smtpPort) || 587,
        user: v.smtpUser || null,
        pass: open("email", s, "smtpPass"),
      },
      resendApiKey: open("email", s, "resendApiKey"),
    };
  }
  const e = env();
  return {
    source: "env",
    provider: e.EMAIL_PROVIDER,
    from: e.EMAIL_FROM,
    smtp: { host: e.SMTP_HOST, port: e.SMTP_PORT, user: e.SMTP_USER ?? null, pass: e.SMTP_PASS ?? null },
    resendApiKey: e.RESEND_API_KEY ?? null,
  };
}

export type CourierSettings = { source: Source; steadfast: { apiKey: string; secretKey: string } | null };

/** Steadfast keys, saved in admin only (there are no environment variables for them). */
export async function courierSettings(): Promise<CourierSettings> {
  const s = (await loadAll()).courier;
  const apiKey = open("courier", s, "steadfastApiKey");
  const secretKey = open("courier", s, "steadfastSecretKey");
  return { source: s.source, steadfast: s.source === "admin" && apiKey && secretKey ? { apiKey, secretKey } : null };
}

export type StorageSettings = {
  source: Source;
  cloudinary: { cloudName: string; apiKey: string; apiSecret: string } | null;
};

export async function storageSettings(): Promise<StorageSettings> {
  const s = (await loadAll()).storage;
  if (s.source === "admin") {
    const apiSecret = open("storage", s, "apiSecret");
    const { cloudName, apiKey } = s.values;
    return { source: "admin", cloudinary: cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null };
  }
  const e = env();
  return {
    source: "env",
    cloudinary:
      e.CLOUDINARY_CLOUD_NAME && e.CLOUDINARY_API_KEY && e.CLOUDINARY_API_SECRET
        ? { cloudName: e.CLOUDINARY_CLOUD_NAME, apiKey: e.CLOUDINARY_API_KEY, apiSecret: e.CLOUDINARY_API_SECRET }
        : null,
  };
}

// ---------- The admin page ----------

const shown = (v: string | null | undefined) => (v ? maskValue(v) : "not set");

/** What the server's environment variables give, secrets masked. */
function envSummary(id: IntegrationId): { label: string; value: string }[] {
  const e = env();
  if (id === "sms")
    return [
      { label: "Provider", value: e.SMS_PROVIDER },
      { label: "Fallback", value: e.SMS_FALLBACK_PROVIDER ?? "none" },
      { label: "Alpha SMS API key", value: shown(e.ALPHA_SMS_API_KEY) },
      { label: "Sender ID", value: e.SMS_SENDER_ID || "numeric" },
    ];
  if (id === "email")
    return [
      { label: "Provider", value: e.EMAIL_PROVIDER },
      { label: "From", value: e.EMAIL_FROM },
      ...(e.EMAIL_PROVIDER === "resend"
        ? [{ label: "Resend API key", value: shown(e.RESEND_API_KEY) }]
        : [
            { label: "SMTP server", value: `${e.SMTP_HOST}:${e.SMTP_PORT}` },
            { label: "SMTP password", value: e.SMTP_USER ? shown(e.SMTP_PASS) : "none" },
          ]),
    ];
  if (id === "courier") return [{ label: "Steadfast", value: "no environment variables: save the keys here" }];
  return [
    { label: "Cloud name", value: e.CLOUDINARY_CLOUD_NAME || "not set" },
    { label: "API secret", value: shown(e.CLOUDINARY_API_SECRET) },
  ];
}

function view(id: IntegrationId, s: StoredIntegration): IntegrationView {
  return {
    id,
    source: s.source,
    values: s.values,
    secrets: Object.fromEntries(
      secretKeys(id).map((k) => {
        const plain = open(id, s, k);
        return [k, plain ? maskValue(plain) : s.secrets[k] ? "saved, but can't be read" : null];
      }),
    ),
    updatedAt: s.updatedAt,
    updatedByName: s.updatedByName,
    env: envSummary(id),
  };
}

/** Every integration for the Integrations page: plain values, secrets masked. Never cached. */
export async function integrationViews(): Promise<IntegrationView[]> {
  forgetIntegrations();
  const all = await loadAll();
  return INTEGRATIONS.map((id) => view(id, all[id]));
}

/** For the audit log: plain values, and each secret only as its mask (or null). */
function auditShape(id: IntegrationId, s: StoredIntegration) {
  const v = view(id, s);
  return { source: v.source, values: v.values, secrets: v.secrets };
}

export type SaveResult = { ok: true; before: unknown; after: unknown } | { ok: false; error: string };

/**
 * Saves one integration. New secret text replaces the stored secret, empty keeps it, `clear` removes
 * it. Values that don't apply to the choice (e.g. Resend's key with SMTP chosen) are kept, so
 * switching back doesn't lose them.
 */
export async function saveIntegration(input: IntegrationInput, by: { id: string; name: string }): Promise<SaveResult> {
  forgetIntegrations();
  const before = (await loadAll())[input.id] ?? EMPTY_INTEGRATION;
  const plain = plainKeys(input.id);
  const secret = secretKeys(input.id);

  const values = Object.fromEntries(
    plain.map((k) => [k, (input.values[k] ?? "").trim()]).filter(([, v]) => v),
  ) as Record<string, string>;
  const secrets: Record<string, string> = { ...before.secrets };
  for (const k of secret) {
    const next = (input.secrets[k] ?? "").trim();
    if (next) secrets[k] = encrypt(next, env().ENCRYPTION_KEY);
    else if (input.clear.includes(k)) delete secrets[k];
  }

  if (input.source === "admin") {
    const has = Object.fromEntries(secret.map((k) => [k, Boolean(secrets[k])]));
    const problem = checkIntegration(input.id, values, has);
    if (problem) return { ok: false, error: problem };
  }

  const after: StoredIntegration = {
    source: input.source,
    values,
    secrets,
    updatedAt: new Date().toISOString(),
    updatedByName: by.name,
  };
  await connectMongoose();
  await Setting.updateOne(
    { _id: KEY },
    { $set: { [`value.${input.id}`]: { ...after, updatedAt: new Date(after.updatedAt!) }, updatedBy: by.id } },
    { upsert: true },
  );
  forgetIntegrations();
  return { ok: true, before: auditShape(input.id, before), after: auditShape(input.id, after) };
}
