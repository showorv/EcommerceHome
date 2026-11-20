/**
 * Creates the first Owner account (or promotes an existing user to Owner) and emails a
 * "set your password" link. Run the worker too, so the email is actually sent.
 *
 *   pnpm owner:create --email you@example.com --name "Your Name"
 *
 * In development the email lands in Mailpit: http://localhost:8025
 */
import "../worker/load-env";
import { parseArgs } from "node:util";
import { z } from "zod";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { writeAudit } from "@/modules/audit/audit";
import { auth } from "@/modules/auth/auth";
import { hashPassword } from "@/modules/auth/password";

async function main() {
  const { values, positionals } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" } },
    allowPositionals: true,
  });
  // Accept the name with or without --name, e.g. `--email a@b.com "Your Name"` or `--email a@b.com Your Name`.
  const name = values.name ?? (positionals.length ? positionals.join(" ") : undefined);
  const input = z
    .object({
      email: z.email("Missing or invalid --email").trim().toLowerCase(),
      name: z.string("Missing --name").trim().min(2, "Name must be at least 2 characters").max(80),
    })
    .safeParse({ email: values.email, name });
  if (!input.success) {
    for (const issue of input.error.issues) console.error(`✗ ${issue.message}`);
    console.error('\nUsage: pnpm owner:create --email you@example.com --name "Your Name"');
    process.exit(1);
  }
  const { email, name: ownerName } = input.data;

  const ctx = await auth.$context;
  const existing = await ctx.internalAdapter.findUserByEmail(email);
  let userId: string;
  if (existing) {
    userId = existing.user.id;
    await ctx.internalAdapter.updateUser(userId, { role: "owner", status: "active" });
    console.log(`Promoted existing user ${email} to owner.`);
  } else {
    const user = await ctx.internalAdapter.createUser(
      {
        name: ownerName,
        email,
        emailVerified: true,
        role: "owner",
        permissions: [],
        status: "active",
      },
      { method: "admin" },
    );
    userId = user.id;
    console.log(`Created owner ${email}.`);
  }
  if (!(await ctx.internalAdapter.findCredentialAccount(userId))) {
    await ctx.internalAdapter.createAccount({
      userId,
      providerId: "credential",
      accountId: userId,
      password: await hashPassword(randomToken()),
    });
  }
  await auth.api.requestPasswordReset({ body: { email, redirectTo: `${env().APP_URL}/admin/set-password` } });
  await writeAudit({
    actor: null,
    action: "staff.bootstrap_owner",
    entity: "user",
    entityId: userId,
    after: { email, role: "owner" },
  });
  console.log("A 'set your password' email was queued. Keep `pnpm worker` running to send it.");
  if (env().NODE_ENV !== "production") console.log("Development inbox: http://localhost:8025");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
