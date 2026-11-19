import "server-only";
import type { ObjectId } from "mongodb";
import { z } from "zod";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { mongoDb } from "@/lib/db/mongo";
import { auth } from "@/modules/auth/auth";
import { hashPassword } from "@/modules/auth/password";
import { STAFF_ROLES, type Role } from "@/modules/auth/rbac";

/** Staff management (FR-AD-09). Callers must check `staff.manage` and write the audit log. */

export const inviteSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().trim().toLowerCase(),
  role: z.enum(["staff", "manager", "owner"]),
});

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "blocked";
  activeSessions: number;
  createdAt: Date;
};

type UserDoc = {
  _id: ObjectId;
  name: string;
  email: string;
  role: Role;
  status?: "active" | "blocked";
  createdAt: Date;
};

export async function listStaff(): Promise<StaffRow[]> {
  const db = mongoDb();
  const users = await db
    .collection<UserDoc>("users")
    .find({ role: { $in: [...STAFF_ROLES] } })
    .sort({ createdAt: 1 })
    .limit(200)
    .toArray();
  const ids = users.map((u) => u._id);
  const counts = await db
    .collection("sessions")
    .aggregate<{ _id: unknown; n: number }>([
      { $match: { userId: { $in: ids }, expiresAt: { $gt: new Date() } } },
      { $group: { _id: "$userId", n: { $sum: 1 } } },
    ])
    .toArray();
  const byUser = new Map(counts.map((c) => [String(c._id), c.n]));
  return users.map((u) => ({
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status ?? "active",
    activeSessions: byUser.get(u._id.toString()) ?? 0,
    createdAt: u.createdAt,
  }));
}

/**
 * Creates (or promotes) a staff account and emails a "set your password" link.
 * The account gets an unusable random password until the link is used.
 */
export async function inviteStaff(input: z.infer<typeof inviteSchema>): Promise<{ userId: string; existed: boolean }> {
  const ctx = await auth.$context;
  const existing = await ctx.internalAdapter.findUserByEmail(input.email);
  let userId: string;
  if (existing) {
    userId = existing.user.id;
    await ctx.internalAdapter.updateUser(userId, { role: input.role, status: "active" });
    await ctx.internalAdapter.deleteUserSessions(userId);
  } else {
    const user = await ctx.internalAdapter.createUser(
      {
        name: input.name,
        email: input.email,
        emailVerified: true,
        role: input.role,
        permissions: [],
        status: "active",
      },
      { method: "admin" },
    );
    userId = user.id;
  }
  if (!(await ctx.internalAdapter.findCredentialAccount(userId))) {
    await ctx.internalAdapter.createAccount({
      userId,
      providerId: "credential",
      accountId: userId,
      password: await hashPassword(randomToken()),
    });
  }
  await auth.api.requestPasswordReset({
    body: { email: input.email, redirectTo: `${env().APP_URL}/admin/set-password` },
  });
  return { userId, existed: !!existing };
}

export async function setStaffRole(userId: string, role: Role): Promise<void> {
  const ctx = await auth.$context;
  await ctx.internalAdapter.updateUser(userId, { role });
  // Sessions cache the user, so sign them out to apply the new permissions immediately.
  await ctx.internalAdapter.deleteUserSessions(userId);
}

export async function setStaffStatus(userId: string, status: "active" | "blocked"): Promise<void> {
  const ctx = await auth.$context;
  await ctx.internalAdapter.updateUser(userId, { status });
  if (status === "blocked") await ctx.internalAdapter.deleteUserSessions(userId);
}

export async function signOutEverywhere(userId: string): Promise<void> {
  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUserSessions(userId);
}

export async function findStaff(userId: string) {
  const ctx = await auth.$context;
  return ctx.internalAdapter.findUserById(userId) as Promise<
    ({ id: string; email: string; role?: string; status?: string } & Record<string, unknown>) | null
  >;
}
