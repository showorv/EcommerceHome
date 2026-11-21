import type { Permission } from "./rbac";

/**
 * Which permission each admin section needs. Used by proxy.ts (real HTTP 403 before any
 * rendering), the admin menu, and — as a second check — each page's requireStaff() call.
 * Longest prefix wins.
 */
export const ADMIN_ROUTE_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: "/admin/products", permission: "products.view" },
  { prefix: "/admin/products/new", permission: "products.edit" },
  { prefix: "/admin/collections/new", permission: "products.edit" },
  { prefix: "/admin/categories", permission: "products.view" },
  { prefix: "/admin/collections", permission: "products.view" },
  { prefix: "/admin/inventory", permission: "products.view" },
  { prefix: "/admin/storefront", permission: "cms.edit" },
  { prefix: "/admin/appearance", permission: "cms.edit" },
  { prefix: "/admin/pages", permission: "cms.edit" },
  { prefix: "/admin/messages", permission: "customers.view" },
  { prefix: "/admin/delivery", permission: "zones.manage" },
  { prefix: "/admin/payments", permission: "settings.manage" },
  { prefix: "/admin/staff", permission: "staff.manage" },
  { prefix: "/admin/audit", permission: "audit.view" },
  { prefix: "/admin/system", permission: "system.view" },
];

/** Admin pages reachable without a full staff session. */
export const PUBLIC_ADMIN_PATHS = ["/admin/sign-in", "/admin/set-password"];

const matches = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(prefix + "/");

export function isPublicAdminPath(pathname: string): boolean {
  return PUBLIC_ADMIN_PATHS.some((p) => matches(pathname, p));
}

export function requiredPermission(pathname: string): Permission | null {
  let best: { prefix: string; permission: Permission } | null = null;
  for (const r of ADMIN_ROUTE_PERMISSIONS) {
    if (matches(pathname, r.prefix) && (!best || r.prefix.length > best.prefix.length)) best = r;
  }
  return best?.permission ?? null;
}
