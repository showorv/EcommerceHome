import { z } from "zod";

/**
 * Customer messages (SRS §2.5, §8.3, FR-OR-06): which events send what, in English or Bangla, by SMS
 * and email. Staff edit the texts in admin; placeholders such as {order_no} are filled when the
 * message is sent. Pure and browser-safe: the admin editor uses the same checks and previews.
 */

export const LANGUAGES = ["en", "bn"] as const;
export type Language = (typeof LANGUAGES)[number];
export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", bn: "বাংলা (Bangla)" };

export const CHANNELS = ["sms", "email"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_NAMES: Record<Channel, string> = { sms: "SMS", email: "Email" };

export const EVENTS = [
  "order_received",
  "order_confirmed",
  "order_shipped",
  "order_delivered",
  "order_cancelled",
  "order_returned",
  "invoice_link",
] as const;
export type NotificationEvent = (typeof EVENTS)[number];
export const isEvent = (v: unknown): v is NotificationEvent => EVENTS.includes(v as NotificationEvent);

export const PLACEHOLDERS = {
  store: "Shop name",
  name: "Customer's name",
  order_no: "Order number",
  total: "Order total",
  cod_amount: "To pay on delivery",
  invoice_no: "Invoice number",
  invoice_link: "Invoice link",
} as const;
export type Placeholder = keyof typeof PLACEHOLDERS;
export type TemplateVars = Partial<Record<Placeholder, string>>;

const ORDER_VARS: Placeholder[] = ["store", "name", "order_no", "total", "cod_amount"];
const INVOICE_VARS: Placeholder[] = [...ORDER_VARS, "invoice_no", "invoice_link"];

export const EVENT_INFO: Record<
  NotificationEvent,
  { name: string; when: string; placeholders: Placeholder[]; defaultOn: Record<Channel, boolean> }
> = {
  order_received: {
    name: "Order received",
    when: "Right after the customer places an order.",
    placeholders: ORDER_VARS,
    defaultOn: { sms: true, email: true },
  },
  order_confirmed: {
    name: "Order confirmed",
    when: "When staff confirm the order. The email has the invoice PDF attached.",
    placeholders: INVOICE_VARS,
    defaultOn: { sms: true, email: true },
  },
  order_shipped: {
    name: "Shipped",
    when: "When the order is marked shipped.",
    placeholders: ORDER_VARS,
    defaultOn: { sms: true, email: true },
  },
  order_delivered: {
    name: "Delivered",
    when: "When the order is marked delivered.",
    placeholders: ORDER_VARS,
    defaultOn: { sms: true, email: true },
  },
  order_cancelled: {
    name: "Cancelled",
    when: "When the order is cancelled (the reason is never shown to the customer).",
    placeholders: ORDER_VARS,
    defaultOn: { sms: false, email: true },
  },
  order_returned: {
    name: "Returned",
    when: "When the courier brings the order back, or the customer returns it.",
    placeholders: ORDER_VARS,
    defaultOn: { sms: false, email: true },
  },
  invoice_link: {
    name: "New invoice link",
    when: "When staff make a new invoice link and choose to send it.",
    placeholders: INVOICE_VARS,
    defaultOn: { sms: true, email: true },
  },
};

export type EmailText = { subject: string; body: string };
export type EventTemplates = { sms: Record<Language, string>; email: Record<Language, EmailText> };

/** The texts every shop starts with. Short SMS: one or two segments with real values. */
export const DEFAULT_TEMPLATES: Record<NotificationEvent, EventTemplates> = {
  order_received: {
    sms: {
      en: "{store}: Order #{order_no} received. We will call you to confirm.",
      bn: "{store}: অর্ডার #{order_no} পেয়েছি। কনফার্ম করতে আমরা আপনাকে কল করব।",
    },
    email: {
      en: {
        subject: "We got your order #{order_no}",
        body: "Hi {name},\n\nThank you for your order #{order_no} ({total}). We will call you soon to confirm it.\n\n{store}",
      },
      bn: {
        subject: "আপনার অর্ডার #{order_no} পেয়েছি",
        body: "প্রিয় {name},\n\nঅর্ডার #{order_no} ({total}) এর জন্য ধন্যবাদ। কনফার্ম করতে আমরা শিগগিরই আপনাকে কল করব।\n\n{store}",
      },
    },
  },
  order_confirmed: {
    sms: {
      en: "{store}: Order #{order_no} confirmed. Total {total}, pay {cod_amount} on delivery. Invoice: {invoice_link}",
      bn: "{store}: অর্ডার #{order_no} কনফার্ম হয়েছে। মোট {total}, ডেলিভারিতে দেবেন {cod_amount}। ইনভয়েস: {invoice_link}",
    },
    email: {
      en: {
        subject: "Order #{order_no} confirmed: invoice {invoice_no}",
        body: "Hi {name},\n\nYour order #{order_no} is confirmed. Total {total}; you pay {cod_amount} when it arrives.\n\nYour invoice {invoice_no} is attached, and you can see it online any time:\n{invoice_link}\n\nThank you for shopping with us.\n{store}",
      },
      bn: {
        subject: "অর্ডার #{order_no} কনফার্ম হয়েছে: ইনভয়েস {invoice_no}",
        body: "প্রিয় {name},\n\nআপনার অর্ডার #{order_no} কনফার্ম হয়েছে। মোট {total}; পণ্য হাতে পেয়ে দেবেন {cod_amount}।\n\nইনভয়েস {invoice_no} এই ইমেইলের সাথে দেওয়া আছে, অনলাইনেও দেখতে পারবেন:\n{invoice_link}\n\nআমাদের সাথে কেনাকাটার জন্য ধন্যবাদ।\n{store}",
      },
    },
  },
  order_shipped: {
    sms: {
      en: "{store}: Order #{order_no} is on the way. Please keep {cod_amount} ready for the delivery person.",
      bn: "{store}: অর্ডার #{order_no} পাঠানো হয়েছে। ডেলিভারির সময় {cod_amount} প্রস্তুত রাখুন।",
    },
    email: {
      en: {
        subject: "Order #{order_no} is on the way",
        body: "Hi {name},\n\nYour order #{order_no} is on its way to you. Please keep {cod_amount} ready for the delivery person.\n\n{store}",
      },
      bn: {
        subject: "অর্ডার #{order_no} পাঠানো হয়েছে",
        body: "প্রিয় {name},\n\nআপনার অর্ডার #{order_no} পাঠানো হয়েছে, শিগগিরই পৌঁছে যাবে। ডেলিভারির সময় {cod_amount} প্রস্তুত রাখুন।\n\n{store}",
      },
    },
  },
  order_delivered: {
    sms: {
      en: "{store}: Order #{order_no} delivered. Thank you for shopping with us!",
      bn: "{store}: অর্ডার #{order_no} ডেলিভারি হয়েছে। আমাদের সাথে কেনাকাটার জন্য ধন্যবাদ!",
    },
    email: {
      en: {
        subject: "Order #{order_no} delivered",
        body: "Hi {name},\n\nYour order #{order_no} has been delivered. We hope you enjoy it! If anything is wrong, reply to this email or call us.\n\n{store}",
      },
      bn: {
        subject: "অর্ডার #{order_no} ডেলিভারি হয়েছে",
        body: "প্রিয় {name},\n\nআপনার অর্ডার #{order_no} ডেলিভারি হয়েছে। কোনো সমস্যা হলে এই ইমেইলের উত্তর দিন বা আমাদের কল করুন।\n\n{store}",
      },
    },
  },
  order_cancelled: {
    sms: {
      en: "{store}: Order #{order_no} has been cancelled. Questions? Please call us.",
      bn: "{store}: অর্ডার #{order_no} বাতিল করা হয়েছে। কোনো প্রশ্ন থাকলে আমাদের কল করুন।",
    },
    email: {
      en: {
        subject: "Order #{order_no} cancelled",
        body: "Hi {name},\n\nYour order #{order_no} has been cancelled. If you didn't expect this or have any questions, reply to this email or call us.\n\n{store}",
      },
      bn: {
        subject: "অর্ডার #{order_no} বাতিল হয়েছে",
        body: "প্রিয় {name},\n\nআপনার অর্ডার #{order_no} বাতিল করা হয়েছে। কোনো প্রশ্ন থাকলে এই ইমেইলের উত্তর দিন বা আমাদের কল করুন।\n\n{store}",
      },
    },
  },
  order_returned: {
    sms: {
      en: "{store}: Order #{order_no} came back to us. Call us if you would still like it.",
      bn: "{store}: অর্ডার #{order_no} আমাদের কাছে ফেরত এসেছে। এখনো চাইলে আমাদের কল করুন।",
    },
    email: {
      en: {
        subject: "Order #{order_no} returned",
        body: "Hi {name},\n\nYour order #{order_no} came back to us. If you would still like it, reply to this email or call us and we will send it again.\n\n{store}",
      },
      bn: {
        subject: "অর্ডার #{order_no} ফেরত এসেছে",
        body: "প্রিয় {name},\n\nআপনার অর্ডার #{order_no} আমাদের কাছে ফেরত এসেছে। এখনো চাইলে এই ইমেইলের উত্তর দিন বা কল করুন, আমরা আবার পাঠাব।\n\n{store}",
      },
    },
  },
  invoice_link: {
    sms: {
      en: "{store}: Your invoice for order #{order_no}: {invoice_link}",
      bn: "{store}: অর্ডার #{order_no} এর ইনভয়েস: {invoice_link}",
    },
    email: {
      en: {
        subject: "Your invoice {invoice_no}",
        body: "Hi {name},\n\nHere is the new link to your invoice {invoice_no} for order #{order_no}:\n{invoice_link}\n\nThe old link no longer works.\n\n{store}",
      },
      bn: {
        subject: "আপনার ইনভয়েস {invoice_no}",
        body: "প্রিয় {name},\n\nঅর্ডার #{order_no} এর ইনভয়েস {invoice_no} এর নতুন লিংক:\n{invoice_link}\n\nআগের লিংকটি আর কাজ করবে না।\n\n{store}",
      },
    },
  },
};

// ---------- Filling in ----------

const PLACEHOLDER_RE = /\{([a-z_]+)\}/g;

/** The text with each {placeholder} replaced; anything unknown becomes empty. */
export function fillTemplate(text: string, vars: TemplateVars): string {
  return text.replace(PLACEHOLDER_RE, (_, k: string) => vars[k as Placeholder] ?? "");
}

/** Placeholders in the text that this event can't fill. */
export function unknownPlaceholders(text: string, allowed: readonly Placeholder[]): string[] {
  const bad = new Set<string>();
  for (const [, k] of text.matchAll(PLACEHOLDER_RE)) if (k && !allowed.includes(k as Placeholder)) bad.add(k);
  return [...bad];
}

/**
 * Money as messages show it. In an English SMS "Tk" instead of "৳": the taka sign isn't in the basic
 * SMS alphabet and would make the whole message Unicode (70 characters a segment instead of 160).
 */
export function messageMoney(poisha: number, channel: Channel, language: Language): string {
  const whole = Math.round(poisha / 100).toLocaleString("en-US");
  return channel === "sms" && language === "en" ? `Tk ${whole}` : `৳${whole}`;
}

/** Values for the editor's preview. */
export function sampleVars(store: string, channel: Channel, language: Language): TemplateVars {
  return {
    store,
    name: language === "bn" ? "রহিম" : "Rahim",
    order_no: "SR10234",
    total: messageMoney(158000, channel, language),
    cod_amount: messageMoney(145000, channel, language),
    invoice_no: "INV-2026-000123",
    invoice_link: "https://yourshop.com/i/x7Kq2mR9vT4wB8nP3sL6aE",
  };
}

// ---------- SMS length ----------

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f";

export type SmsLength = { unicode: boolean; length: number; segments: number; perSegment: number };

/**
 * How many SMS a text costs. Plain English fits 160 characters (153 per part when longer); any
 * Bangla letter or "৳" makes it Unicode: 70 (67 per part).
 */
export function smsLength(text: string): SmsLength {
  let gsm = 0;
  let unicode = false;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) gsm += 1;
    else if (GSM_EXTENDED.includes(ch)) gsm += 2;
    else {
      unicode = true;
      break;
    }
  }
  const length = unicode ? text.length : gsm;
  const [single, multi] = unicode ? [70, 67] : [160, 153];
  const segments = length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi);
  return { unicode, length, segments, perSegment: segments > 1 ? multi : single };
}

// ---------- Settings ----------

export type NotificationSettings = {
  /** The language customers get messages in. */
  language: Language;
  enabled: Record<NotificationEvent, Record<Channel, boolean>>;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  language: "en",
  enabled: Object.fromEntries(
    EVENTS.map((e) => [e, { ...EVENT_INFO[e].defaultOn }]),
  ) as NotificationSettings["enabled"],
};

/** Saved settings (or anything odd in the database) → settings, filling gaps with the defaults. */
export function readNotificationSettings(v: unknown): NotificationSettings {
  const s = (v ?? {}) as { language?: unknown; enabled?: Record<string, { sms?: unknown; email?: unknown }> };
  const language = LANGUAGES.includes(s.language as Language) ? (s.language as Language) : "en";
  const enabled = Object.fromEntries(
    EVENTS.map((e) => {
      const d = EVENT_INFO[e].defaultOn;
      const got = s.enabled?.[e];
      return [
        e,
        {
          sms: typeof got?.sms === "boolean" ? got.sms : d.sms,
          email: typeof got?.email === "boolean" ? got.email : d.email,
        },
      ];
    }),
  ) as NotificationSettings["enabled"];
  return { language, enabled };
}

// ---------- What staff save ----------

const smsText = z
  .string()
  .trim()
  .min(1, "SMS: write the message")
  .max(480, "SMS: keep it under 480 characters (3 Unicode SMS cost as much as 7 plain ones)");
const emailText = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "Email: write a subject")
    .max(150, "Email subject: keep it under 150 characters")
    .transform((s) => s.replace(/\s+/g, " ")),
  body: z.string().trim().min(1, "Email: write the message").max(4000, "Email: keep it under 4,000 characters"),
});

export const templateSaveInput = z
  .object({
    event: z.enum(EVENTS),
    enabled: z.object({ sms: z.boolean(), email: z.boolean() }),
    sms: z.object({ en: smsText, bn: smsText }),
    email: z.object({ en: emailText, bn: emailText }),
  })
  .superRefine((v, ctx) => {
    const allowed = EVENT_INFO[v.event].placeholders;
    const check = (text: string, path: (string | number)[], label: string) => {
      const bad = unknownPlaceholders(text, allowed);
      if (bad.length > 0) {
        ctx.addIssue({
          code: "custom",
          path,
          message: `${label}: {${bad[0]}} can't be used here. Use ${allowed.map((p) => `{${p}}`).join(", ")}.`,
        });
      }
    };
    for (const l of LANGUAGES) {
      const lang = l === "en" ? "English" : "Bangla";
      check(v.sms[l], ["sms", l], `${lang} SMS`);
      check(v.email[l].subject, ["email", l, "subject"], `${lang} email subject`);
      check(v.email[l].body, ["email", l, "body"], `${lang} email`);
    }
  });
export type TemplateSave = z.infer<typeof templateSaveInput>;

export const languageInput = z.object({ language: z.enum(LANGUAGES) });

// ---------- The log (FR-OR-07) ----------

export const NOTIFICATION_STATUSES = ["queued", "sent", "failed"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
export const NOTIFICATION_STATUS_NAMES: Record<NotificationStatus, string> = {
  queued: "Waiting",
  sent: "Sent",
  failed: "Failed",
};

/** Codes and sign-in links: logged without their text, and never sent again by hand. */
export const isPrivatePurpose = (purpose: string) =>
  /(^|_)otp$/.test(purpose) || purpose === "password_reset" || purpose === "verify_email";

export function purposeName(purpose: string): string {
  if (isEvent(purpose)) return EVENT_INFO[purpose].name;
  const names: Record<string, string> = {
    otp: "Sign-in code",
    checkout_otp: "Checkout code",
    password_reset_otp: "Password reset code",
    password_reset: "Password link",
    verify_email: "Email check",
  };
  return names[purpose] ?? purpose.replace(/_/g, " ");
}
