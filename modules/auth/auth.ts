import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { haveIBeenPwned } from "better-auth/plugins/haveibeenpwned";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { env, isProd } from "@/lib/env";
import { mongoClient, mongoDb } from "@/lib/db/mongo";
import { enqueueNotification } from "@/lib/queue";
import { isBdPhone, maskPhone, normalizeBdPhone } from "@/lib/phone";
import { redis } from "@/lib/redis";
import { tryWriteAudit } from "@/modules/audit/audit";
import { clearFailures, isLocked, recordFailure } from "./lockout";
import { hashPassword, verifyPassword } from "./password";
import { isStaff } from "./rbac";

const e = env();

const SIGN_IN_PATHS = new Set(["/sign-in/email", "/sign-in/phone-number"]);

function signInIdentifier(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.email === "string") return "email:" + b.email.trim().toLowerCase();
  if (typeof b.phoneNumber === "string") return "phone:" + (normalizeBdPhone(b.phoneNumber) ?? b.phoneNumber);
  return null;
}

/**
 * Better Auth configuration (SRS FR-AC-01…05, FR-AD-09, NFR-SEC-01…05).
 * - Google OAuth (Authorization Code + PKCE, handled by Better Auth)
 * - Email + password and phone + password, Argon2id hashing, breached-password check
 * - Phone OTP (sent through the notification queue)
 * - Sessions in the database, cookies HttpOnly + Secure (prod) + SameSite=Lax
 */
export const auth = betterAuth({
  appName: e.STORE_NAME,
  baseURL: e.APP_URL,
  secret: e.BETTER_AUTH_SECRET,
  trustedOrigins: [e.APP_URL],
  database: mongodbAdapter(mongoDb(), { client: mongoClient() }),

  secondaryStorage: {
    get: (key) => redis().get(`ba:${key}`),
    set: async (key, value, ttl) => {
      if (ttl) await redis().set(`ba:${key}`, value, "EX", ttl);
      else await redis().set(`ba:${key}`, value);
    },
    delete: async (key) => {
      await redis().del(`ba:${key}`);
    },
    getAndDelete: (key) => redis().getdel(`ba:${key}`),
    increment: async (key, ttl) => {
      // INCR + EXPIRE NX in one transaction: TTL is set only when the counter is created.
      const res = await redis().multi().incr(`ba:${key}`).expire(`ba:${key}`, ttl, "NX").exec();
      return Number(res?.[0]?.[1] ?? 0);
    },
  },

  user: {
    modelName: "users",
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "customer", input: false },
      permissions: { type: "string[]", required: false, defaultValue: [], input: false },
      status: { type: "string", required: false, defaultValue: "active", input: false },
    },
  },
  session: {
    modelName: "sessions",
    storeSessionInDatabase: true, // lets staff see and revoke sessions (FR-AD-09)
    expiresIn: 60 * 60 * 24 * 14, // 14 days
    updateAge: 60 * 60 * 24, // refresh once a day
  },
  account: {
    modelName: "accounts",
    accountLinking: { enabled: true, trustedProviders: ["google"] }, // FR-AC-05
  },
  verification: { modelName: "verifications" },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    password: { hash: hashPassword, verify: verifyPassword },
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      await enqueueNotification({
        kind: "email",
        purpose: "password_reset",
        to: user.email,
        // Used for both password resets and staff invites.
        subject: `Set your ${e.STORE_NAME} password`,
        text: `Hi ${user.name},\n\nUse this link to set your password. It expires in 1 hour.\n\n${url}\n\nIf you did not expect this email, you can ignore it.`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await enqueueNotification({
        kind: "email",
        purpose: "verify_email",
        to: user.email,
        subject: `Verify your email for ${e.STORE_NAME}`,
        text: `Hi ${user.name},\n\nConfirm your email address:\n\n${url}`,
      });
    },
  },

  socialProviders:
    e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: e.GOOGLE_CLIENT_ID,
            clientSecret: e.GOOGLE_CLIENT_SECRET,
            scope: ["openid", "email", "profile"],
          },
        }
      : {},

  rateLimit: {
    enabled: true,
    storage: "secondary-storage",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 15 * 60, max: 20 }, // per IP; per-account lockout is below
      "/sign-in/phone-number": { window: 15 * 60, max: 20 },
      "/sign-up/email": { window: 60 * 60, max: 10 },
      "/phone-number/send-otp": { window: 10 * 60, max: 3 },
      "/request-password-reset": { window: 15 * 60, max: 5 },
    },
  },

  advanced: {
    useSecureCookies: isProd(),
    ipAddress: { ipAddressHeaders: [e.CLIENT_IP_HEADER] },
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: isProd() },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!SIGN_IN_PATHS.has(ctx.path)) return;
      const id = signInIdentifier(ctx.body);
      if (id && (await isLocked(redis(), id))) {
        // Generic message: does not reveal whether the account exists (NFR-SEC-05).
        throw new APIError("TOO_MANY_REQUESTS", { message: "Too many attempts. Try again in 15 minutes." });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (!SIGN_IN_PATHS.has(ctx.path)) return;
      const id = signInIdentifier(ctx.body);
      if (!id) return;
      const returned = ctx.context.returned;
      if (isAPIError(returned)) {
        if (returned.statusCode === 401) {
          const { locked } = await recordFailure(redis(), id);
          if (locked) {
            const [kind, value = ""] = id.split(":");
            await tryWriteAudit({
              actor: null,
              action: "auth.locked",
              entity: "account",
              entityId: kind === "phone" ? `phone:${maskPhone(value)}` : id,
            });
          }
        }
      } else {
        await clearFailures(redis(), id);
      }
    }),
  },

  databaseHooks: {
    session: {
      create: {
        before: async (session, ctx) => {
          // Blocked users cannot start a session.
          const user = await ctx?.context.internalAdapter.findUserById(session.userId);
          if (user && (user as { status?: string }).status === "blocked") return false;
        },
        after: async (session, ctx) => {
          const user = await ctx?.context.internalAdapter.findUserById(session.userId);
          if (user && isStaff(user as { role?: string })) {
            await tryWriteAudit({
              actor: { id: user.id, email: user.email },
              action: "auth.sign_in",
              entity: "user",
              entityId: user.id,
              ip: session.ipAddress ?? null,
              userAgent: session.userAgent ?? null,
            });
          }
        },
      },
    },
  },

  plugins: [
    haveIBeenPwned({ enabled: isProd() || process.env.HIBP_IN_DEV === "1" }),
    phoneNumber({
      otpLength: 6,
      expiresIn: 5 * 60,
      allowedAttempts: 5,
      phoneNumberValidator: (p) => isBdPhone(p),
      sendOTP: async ({ phoneNumber: to, code }) => {
        await enqueueNotification({
          kind: "sms",
          purpose: "otp",
          to,
          text: `${code} is your ${e.STORE_NAME} code. It expires in 5 minutes. Do not share it.`,
        });
      },
      sendPasswordResetOTP: async ({ phoneNumber: to, code }) => {
        await enqueueNotification({
          kind: "sms",
          purpose: "password_reset_otp",
          to,
          text: `${code} is your ${e.STORE_NAME} password reset code. It expires in 5 minutes.`,
        });
      },
    }),
    nextCookies(), // must be last: lets server actions set auth cookies
  ],
});

export type Auth = typeof auth;
export type AuthSession = typeof auth.$Infer.Session;
