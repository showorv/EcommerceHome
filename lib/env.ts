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

const schema = z.object({
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

  SMS_PROVIDER: z.enum(["console"]).default("console"),

  CLOUDINARY_CLOUD_NAME: optional,
  CLOUDINARY_API_KEY: optional,
  CLOUDINARY_API_SECRET: optional,

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
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
