/**
 * Role-based access control (SRS §1.3, NFR-SEC-07).
 * Pure functions with no I/O so they can be used anywhere and unit-tested.
 * Permissions are granular strings; custom roles later only need a new entry here
 * or extra per-user permissions, not code changes in the features.
 */
export const PERMISSIONS = [
  "orders.view",
  "orders.create",
  "orders.update",
  "orders.confirm",
  "orders.cancel",
  "orders.export",
  "orders.refund",
  "customers.view",
  "customers.block",
  "products.view",
  "products.edit",
  "products.delete",
  "inventory.edit",
  "coupons.manage",
  "zones.manage",
  "media.upload",
  "cms.edit",
  "cms.publish",
  "reports.view",
  "staff.manage",
  "settings.manage",
  "integrations.manage",
  "audit.view",
  "data.export",
  "system.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["customer", "staff", "manager", "owner"] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES: readonly Role[] = ["staff", "manager", "owner"];

const STAFF: Permission[] = [
  "orders.view",
  "orders.create",
  "orders.update",
  "orders.confirm",
  "orders.cancel",
  "customers.view",
  "products.view",
];

const MANAGER: Permission[] = [
  ...STAFF,
  "orders.export",
  "orders.refund",
  "customers.block",
  "products.edit",
  "products.delete",
  "inventory.edit",
  "coupons.manage",
  "zones.manage",
  "media.upload",
  "cms.edit",
  "cms.publish",
  "reports.view",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  customer: [],
  staff: STAFF,
  manager: MANAGER,
  owner: PERMISSIONS,
};

export type RbacSubject = {
  role?: string | null;
  permissions?: readonly string[] | null;
  status?: string | null;
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isStaff(subject: RbacSubject | null | undefined): boolean {
  return !!subject && isRole(subject.role) && STAFF_ROLES.includes(subject.role);
}

/** All permissions a user has: their role's set plus any extra per-user grants. */
export function permissionsOf(subject: RbacSubject | null | undefined): Set<Permission> {
  const out = new Set<Permission>();
  if (!subject || subject.status === "blocked" || !isRole(subject.role)) return out;
  for (const p of ROLE_PERMISSIONS[subject.role]) out.add(p);
  if (subject.role !== "customer") {
    for (const p of subject.permissions ?? []) {
      if ((PERMISSIONS as readonly string[]).includes(p)) out.add(p as Permission);
    }
  }
  return out;
}

export function can(subject: RbacSubject | null | undefined, permission: Permission): boolean {
  return permissionsOf(subject).has(permission);
}
