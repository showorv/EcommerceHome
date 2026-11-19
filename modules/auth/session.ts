import "server-only";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { auth, type AuthSession } from "./auth";
import { can, isStaff, permissionsOf, type Permission } from "./rbac";

/**
 * Data Access Layer for authentication. Every admin page, server action and route
 * handler calls one of these — never trust a hidden button (NFR-SEC-07).
 */
export async function getSession(): Promise<AuthSession | null> {
  return auth.api.getSession({ headers: await headers() });
}

export type StaffContext = {
  session: AuthSession;
  user: AuthSession["user"];
  permissions: Set<Permission>;
};

/**
 * For admin pages. Redirects to sign-in when signed out or not allowed in,
 * and renders 403 when the role lacks the permission.
 */
export async function requireStaff(permission?: Permission): Promise<StaffContext> {
  const session = await getSession();
  if (!session) redirect("/admin/sign-in");
  const user = session.user;
  if (!isStaff(user)) redirect("/admin/sign-in?error=not_staff");
  if (user.status === "blocked") redirect("/admin/sign-in?error=blocked");
  if (permission && !can(user, permission)) forbidden();
  return { session, user, permissions: permissionsOf(user) };
}

/**
 * For server actions and route handlers: returns a result instead of redirecting,
 * so the caller can answer with 401/403.
 */
export async function checkStaff(
  permission?: Permission,
): Promise<{ ok: true; ctx: StaffContext } | { ok: false; status: 401 | 403 }> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401 };
  const user = session.user;
  if (!isStaff(user) || user.status === "blocked") return { ok: false, status: 403 };
  if (permission && !can(user, permission)) return { ok: false, status: 403 };
  return { ok: true, ctx: { session, user, permissions: permissionsOf(user) } };
}

/** Request IP and user agent for audit entries. */
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const ipHeader = process.env.CLIENT_IP_HEADER ?? "x-forwarded-for";
  const ip = h.get(ipHeader)?.split(",")[0]?.trim() ?? null;
  return { ip, userAgent: h.get("user-agent") };
}
