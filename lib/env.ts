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

    MONGODB_URI: z.string().min(1),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    /** Base64 of 32 random bytes. Encrypts integration keys stored in the database (NFR-SEC-13). */
    ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "ENCRYPTION_KEY must be base64 of 32 bytes"),

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
     * SMS gateway (SRS §8.2). "console" prints messages (and OTP codes) in the worker log; "alpha" is
     * Alpha SMS (sms.net.bd), a BTRC-listed Bangladeshi A2P aggregator. The fallback is tried when the
     * main provider fails (NFR-AV-02).
     */
    SMS_PROVIDER: z.enum(["console", "alpha"]).default("console"),
    SMS_FALLBACK_PROVIDER: z.enum(["console", "alpha"]).optional(),
    /** Approved masking name (sender ID). Unset = the provider's default numeric sender. */
    SMS_SENDER_ID: optional,
    ALPHA_SMS_API_KEY: optional,

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
