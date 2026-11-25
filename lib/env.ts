import { z } from "zod";

/**
 * Typed, validated environment. Imported by the Next.js server and by the worker.
 * Never import this from a client component: secrets are not available in the browser
 * and validation would fail.
 */
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v : undefined));

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url().default("http://localhost:3000"),
    STORE_NAME: z.string().min(1).default("China Import Store"),
    /**
     * Where the worker and scripts reach the web app directly (in Docker: http://web:3000), so page
     * refreshes don't go out through Cloudflare and back. Unset = APP_URL.
     */
    INTERNAL_APP_URL: z.url().optional(),
    /**
     * Whether search engines may index the shop (robots.txt and meta robots, NFR-UX-01). Unset = yes
     * when APP_URL is https, no on plain http. Set "off" on staging so it never shows up in Google.
     */
    SEARCH_INDEXING: z.enum(["on", "off"]).optional(),

    MONGODB_URI: z.string().min(1),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    /** Base64 of 32 random bytes. Encrypts integration keys stored in the database (NFR-SEC-13). */
    ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "ENCRYPTION_KEY must be base64 of 32 bytes"),

    /** First Owner account, created at start-up when missing (modules/auth/owner-from-env.ts). */
    OWNER_EMAIL: optional,
    OWNER_PASSWORD: optional,
    OWNER_NAME: optional,

    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,

    /** Header set by our own reverse proxy / Cloudflare with the real client IP. */
    CLIENT_IP_HEADER: z.string().default("x-forwarded-for"),

    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().int().default(1025),
    SMTP_USER: optional,
    SMTP_PASS: optional,
    EMAIL_FROM: z.string().default("Store <no-reply@localhost>"),
    /**
     * Email provider (SRS §8.3): "smtp" uses the SMTP_* settings (Mailpit in development; Amazon SES and
     * Brevo give SMTP settings too); "resend" uses Resend's API with RESEND_API_KEY.
     */
    EMAIL_PROVIDER: z.enum(["smtp", "resend"]).default("smtp"),
    RESEND_API_KEY: optional,

    /**
     * SMS gateway (SRS §8.2). "console" prints messages (and OTP codes) in the worker log; "alpha" is
     * Alpha SMS (sms.net.bd), a BTRC-listed Bangladeshi A2P aggregator. The fallback is tried when the
     * main provider fails (NFR-AV-02).
     */
    SMS_PROVIDER: z.enum(["console", "alpha"]).default("console"),
    SMS_FALLBACK_PROVIDER: z.enum(["console", "alpha"]).optional(),
    /** Approved masking name (sender ID). Unset = the provider's default numeric sender. */
    SMS_SENDER_ID: optional,
    ALPHA_SMS_API_KEY: optional,

    /**
     * Chrome/Chromium for invoice PDFs (FR-OR-03): the full path to its executable, e.g.
     * /usr/bin/chromium in the production image. Unset = the Google Chrome installed on this computer.
     */
    CHROMIUM_PATH: optional,

    CLOUDINARY_CLOUD_NAME: optional,
    CLOUDINARY_API_KEY: optional,
    CLOUDINARY_API_SECRET: optional,

    /**
     * Lets scripts and the worker refresh store pages through POST /api/internal/revalidate (NFR-SC-02).
     * Unset = that endpoint is switched off. At least 32 random characters.
     */
    REVALIDATE_SECRET: optional.refine((v) => v === undefined || v.length >= 32, {
      message: "REVALIDATE_SECRET must be at least 32 characters",
    }),

    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  })
  .superRefine((v, ctx) => {
    const uses = (p: string) => v.SMS_PROVIDER === p || v.SMS_FALLBACK_PROVIDER === p;
    if (uses("alpha") && !v.ALPHA_SMS_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["ALPHA_SMS_API_KEY"],
        message: "ALPHA_SMS_API_KEY is needed for Alpha SMS",
      });
    }
    if (v.EMAIL_PROVIDER === "resend" && !v.RESEND_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "RESEND_API_KEY is needed for Resend" });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${issues}\nCopy .env.example to .env.local and fill it in.`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";
