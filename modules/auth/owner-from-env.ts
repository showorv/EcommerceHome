import { z } from "zod";

/**
 * The first Owner account, created from settings instead of a terminal command:
 *
 *   OWNER_EMAIL=you@example.com
 *   OWNER_PASSWORD=a-long-password
 *   OWNER_NAME=Your Name        (optional)
 *
 * The web app checks these once when it starts (instrumentation.ts). If no account has that email
 * yet, it creates an active Owner who can sign in with that password straight away. If the account
 * already exists, nothing is changed: the password is never reset from here, so changing it in the
 * admin sticks, and the settings can be removed after the first start.
 */

export const OWNER_PASSWORD_MIN = 10;

const ownerSettings = z.object({
  email: z.email("OWNER_EMAIL isn't a valid email address").trim().toLowerCase(),
  password: z
    .string()
    .min(OWNER_PASSWORD_MIN, `OWNER_PASSWORD must be at least ${OWNER_PASSWORD_MIN} characters`)
    .max(128, "OWNER_PASSWORD must be at most 128 characters"),
  name: z.string().trim().min(2, "OWNER_NAME must be at least 2 characters").max(80),
});

export type OwnerSettings = z.infer<typeof ownerSettings>;

/** null = not set up (nothing to do). Pure, so it can be tested without a database. */
export function readOwnerSettings(
  vars: Record<string, string | undefined>,
): { ok: true; owner: OwnerSettings } | { ok: false; errors: string[] } | null {
  const email = vars.OWNER_EMAIL?.trim();
  const password = vars.OWNER_PASSWORD;
  if (!email && !password) return null;
  if (!email || !password) {
    return { ok: false, errors: ["Set both OWNER_EMAIL and OWNER_PASSWORD (or neither)."] };
  }
  const r = ownerSettings.safeParse({ email, password, name: vars.OWNER_NAME?.trim() || "Owner" });
  return r.success ? { ok: true, owner: r.data } : { ok: false, errors: r.error.issues.map((i) => i.message) };
}

export type OwnerResult = "created" | "exists" | "not-set" | "invalid";

/** Creates the Owner from OWNER_* when that email has no account yet. Never logs the password. */
export async function ensureOwnerFromEnv(vars: Record<string, string | undefined> = process.env): Promise<OwnerResult> {
  const { logger } = await import("@/lib/logger");
  const settings = readOwnerSettings(vars);
  if (!settings) return "not-set";
  if (!settings.ok) {
    for (const e of settings.errors) logger.error(`Owner account from settings: ${e}`);
    return "invalid";
  }
  const { email, password, name } = settings.owner;

  const [{ auth }, { hashPassword }, { tryWriteAudit }] = await Promise.all([
    import("./auth"),
    import("./password"),
    import("@/modules/audit/audit"),
  ]);
  const ctx = await auth.$context;
  if (await ctx.internalAdapter.findUserByEmail(email)) {
    logger.info("Owner account from settings: an account with OWNER_EMAIL already exists, so nothing was changed.");
    return "exists";
  }

  let userId: string;
  try {
    const user = await ctx.internalAdapter.createUser(
      { name, email, emailVerified: true, role: "owner", permissions: [], status: "active" },
      { method: "admin" },
    );
    userId = user.id;
  } catch (err) {
    // Another server instance starting at the same moment created it first.
    if (await ctx.internalAdapter.findUserByEmail(email)) return "exists";
    throw err;
  }
  await ctx.internalAdapter.createAccount({
    userId,
    providerId: "credential",
    accountId: userId,
    password: await hashPassword(password),
  });
  await tryWriteAudit({
    actor: null,
    action: "staff.bootstrap_owner",
    entity: "user",
    entityId: userId,
    after: { email, role: "owner", source: "settings" },
  });
  logger.info({ email }, "Owner account created from OWNER_EMAIL / OWNER_PASSWORD. You can remove them now.");
  return "created";
}
