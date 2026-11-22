import { z } from "zod";

/**
 * Integration keys entered in admin (FR-AD-12, NFR-SEC-13). Pure and browser-safe: what each
 * integration asks for, how a save is checked, and how values are shown.
 *
 * Every integration has a **source**: "env" keeps using the server's environment variables (the
 * default, and how development works), "admin" uses what was saved on the Integrations page. Secret
 * fields are stored encrypted (AES-256-GCM, lib/crypto.ts) and only ever sent back to the browser masked.
 */

export const INTEGRATIONS = ["sms", "email", "courier", "storage"] as const;
export type IntegrationId = (typeof INTEGRATIONS)[number];

export const SOURCES = ["env", "admin"] as const;
export type Source = (typeof SOURCES)[number];

export type FieldDef = {
  key: string;
  label: string;
  /** Stored encrypted, shown masked, never sent to the browser in full. */
  secret?: boolean;
  options?: readonly { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  /** Only asked for when another field has one of these values. */
  when?: { field: string; is: readonly string[] };
};

export type IntegrationDef = { id: IntegrationId; title: string; description: string; fields: readonly FieldDef[] };

export const SMS_PROVIDERS = ["console", "alpha"] as const;
export const EMAIL_PROVIDERS = ["smtp", "resend"] as const;

const SMS_OPTIONS = [
  { value: "alpha", label: "Alpha SMS (sms.net.bd)" },
  { value: "console", label: "Don't send: print to the worker log (testing)" },
] as const;

export const INTEGRATION_DEFS: readonly IntegrationDef[] = [
  {
    id: "sms",
    title: "SMS",
    description: "Checkout codes and order messages. A fallback provider is tried when the first one fails.",
    fields: [
      { key: "provider", label: "Provider", options: SMS_OPTIONS },
      {
        key: "fallback",
        label: "Fallback provider",
        options: [{ value: "", label: "None" }, ...SMS_OPTIONS],
      },
      {
        key: "alphaApiKey",
        label: "Alpha SMS API key",
        secret: true,
        help: "From the sms.net.bd dashboard.",
        when: { field: "provider|fallback", is: ["alpha"] },
      },
      {
        key: "senderId",
        label: "Sender ID (masking name)",
        placeholder: "Leave empty for a numeric sender",
        help: "Only an approved name works.",
        when: { field: "provider|fallback", is: ["alpha"] },
      },
    ],
  },
  {
    id: "email",
    title: "Email",
    description: "Order emails, invoices, password resets and staff invites.",
    fields: [
      {
        key: "provider",
        label: "Provider",
        options: [
          { value: "smtp", label: "SMTP (Amazon SES, Brevo, any mail server)" },
          { value: "resend", label: "Resend" },
        ],
      },
      { key: "from", label: "From", placeholder: "Store name <no-reply@mail.example.com>" },
      {
        key: "smtpHost",
        label: "SMTP host",
        placeholder: "email-smtp.ap-south-1.amazonaws.com",
        when: { field: "provider", is: ["smtp"] },
      },
      { key: "smtpPort", label: "SMTP port", placeholder: "587", when: { field: "provider", is: ["smtp"] } },
      { key: "smtpUser", label: "SMTP user name", when: { field: "provider", is: ["smtp"] } },
      { key: "smtpPass", label: "SMTP password", secret: true, when: { field: "provider", is: ["smtp"] } },
      { key: "resendApiKey", label: "Resend API key", secret: true, when: { field: "provider", is: ["resend"] } },
    ],
  },
  {
    id: "courier",
    title: "Courier",
    description: "Steadfast merchant keys. Booking parcels from an order arrives with the courier step (2.13).",
    fields: [
      { key: "steadfastApiKey", label: "Steadfast API key", secret: true },
      { key: "steadfastSecretKey", label: "Steadfast secret key", secret: true },
    ],
  },
  {
    id: "storage",
    title: "Media storage",
    description: "Cloudinary, for product images and videos uploaded in admin.",
    fields: [
      { key: "cloudName", label: "Cloud name" },
      { key: "apiKey", label: "API key" },
      { key: "apiSecret", label: "API secret", secret: true },
    ],
  },
];

export const defOf = (id: IntegrationId) => INTEGRATION_DEFS.find((d) => d.id === id)!;
export const secretKeys = (id: IntegrationId) =>
  defOf(id)
    .fields.filter((f) => f.secret)
    .map((f) => f.key);
export const plainKeys = (id: IntegrationId) =>
  defOf(id)
    .fields.filter((f) => !f.secret)
    .map((f) => f.key);

/** Whether a field applies, given the other values ("a|b" = either field). */
export function fieldApplies(f: FieldDef, values: Record<string, string>): boolean {
  if (!f.when) return true;
  return f.when.field.split("|").some((k) => f.when!.is.includes(values[k] ?? ""));
}

// ---------- Stored shape ----------

/** One integration as stored: plain values, and secrets as `v1.…` ciphertext. */
export type StoredIntegration = {
  source: Source;
  values: Record<string, string>;
  secrets: Record<string, string>;
  updatedAt: string | null;
  updatedByName: string;
};

export const EMPTY_INTEGRATION: StoredIntegration = {
  source: "env",
  values: {},
  secrets: {},
  updatedAt: null,
  updatedByName: "",
};

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** A stored document back to a known shape: unknown keys and non-strings are dropped. */
export function readStored(id: IntegrationId, raw: unknown): StoredIntegration {
  const r = (raw ?? {}) as Record<string, unknown>;
  const values = (r.values ?? {}) as Record<string, unknown>;
  const secrets = (r.secrets ?? {}) as Record<string, unknown>;
  const pick = (keys: string[], from: Record<string, unknown>) =>
    Object.fromEntries(keys.filter((k) => str(from[k])).map((k) => [k, str(from[k])]));
  return {
    source: r.source === "admin" ? "admin" : "env",
    values: pick(plainKeys(id), values),
    secrets: pick(secretKeys(id), secrets),
    updatedAt: r.updatedAt ? new Date(r.updatedAt as string).toISOString() : null,
    updatedByName: str(r.updatedByName),
  };
}

// ---------- Saving ----------

const text = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters.`);

/** What the browser sends: new secret text replaces the stored one; empty keeps it; `clear` removes it. */
export const integrationInput = z.object({
  id: z.enum(INTEGRATIONS),
  source: z.enum(SOURCES),
  values: z.record(z.string(), text(200)).default({}),
  secrets: z.record(z.string(), text(500)).default({}),
  clear: z.array(z.string()).max(10).default([]),
});
export type IntegrationInput = z.infer<typeof integrationInput>;

const EMAIL_FROM = /^(?:[^<>]{1,80}<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/;

/**
 * Checks the values that will be in force, with secrets as booleans (set or not), and returns the
 * first problem in plain words. Only checked when the source is "admin": "env" ignores the values.
 */
export function checkIntegration(
  id: IntegrationId,
  values: Record<string, string>,
  hasSecret: Record<string, boolean>,
): string | null {
  const need = (key: string, label: string) => (hasSecret[key] || values[key] ? null : `${label} is needed.`);
  if (id === "sms") {
    if (!(SMS_PROVIDERS as readonly string[]).includes(values.provider ?? "")) return "Choose an SMS provider.";
    if (values.fallback && !(SMS_PROVIDERS as readonly string[]).includes(values.fallback))
      return "Choose a fallback provider.";
    if (values.fallback === values.provider) return "The fallback must be a different provider.";
    if ((values.provider === "alpha" || values.fallback === "alpha") && !hasSecret.alphaApiKey)
      return "Alpha SMS API key is needed.";
    if (values.senderId && !/^[A-Za-z0-9 .-]{3,20}$/.test(values.senderId))
      return "Sender ID: 3–20 letters, digits, spaces, dots or dashes.";
    return null;
  }
  if (id === "email") {
    if (!(EMAIL_PROVIDERS as readonly string[]).includes(values.provider ?? "")) return "Choose an email provider.";
    if (!values.from || !EMAIL_FROM.test(values.from))
      return 'From: an address, or a name and address like "Store <no-reply@mail.example.com>".';
    if (values.provider === "resend") return need("resendApiKey", "Resend API key");
    if (!values.smtpHost || !/^[A-Za-z0-9.-]{1,253}$/.test(values.smtpHost)) return "SMTP host is needed.";
    const port = Number(values.smtpPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return "SMTP port: a number from 1 to 65535.";
    if (Boolean(values.smtpUser) !== Boolean(hasSecret.smtpPass))
      return "SMTP user name and password go together: give both, or neither.";
    return null;
  }
  if (id === "courier") {
    if (Boolean(hasSecret.steadfastApiKey) !== Boolean(hasSecret.steadfastSecretKey))
      return "Steadfast needs both the API key and the secret key.";
    return null;
  }
  // storage
  const set = [values.cloudName, values.apiKey, hasSecret.apiSecret].filter(Boolean).length;
  if (set !== 0 && set !== 3) return "Cloudinary needs the cloud name, API key and API secret together.";
  if (values.cloudName && !/^[A-Za-z0-9_-]{1,64}$/.test(values.cloudName))
    return "Cloud name: letters, digits, - or _.";
  return null;
}

/** "••••••••a1b2" for anything long enough; short secrets show only dots. */
export function maskValue(secret: string): string {
  return secret.length >= 12 ? `••••••••${secret.slice(-4)}` : "••••••••";
}

// ---------- What the page shows ----------

/** One integration for the page: plain values, and each secret only as set (masked) or not. */
export type IntegrationView = {
  id: IntegrationId;
  source: Source;
  values: Record<string, string>;
  secrets: Record<string, string | null>;
  updatedAt: string | null;
  updatedByName: string;
  /** What the server's environment has, for the "env" choice (secrets masked). */
  env: { label: string; value: string }[];
};
