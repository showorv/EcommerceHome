import type Redis from "ioredis";
import { describe, expect, it } from "vitest";
import { rateLimit } from "@/lib/rate-limit";
import { clearFailures, isLocked, MAX_FAILED_SIGN_INS, recordFailure } from "@/modules/auth/lockout";
import { can, isStaff, permissionsOf } from "@/modules/auth/rbac";

describe("RBAC", () => {
  it("staff can confirm orders but not open settings, integrations, staff or reports (SRS §9.1)", () => {
    const staff = { role: "staff" };
    expect(can(staff, "orders.confirm")).toBe(true);
    for (const p of ["settings.manage", "integrations.manage", "staff.manage", "reports.view"] as const) {
      expect(can(staff, p)).toBe(false);
    }
  });

  it("managers run catalogue and content but not staff or settings", () => {
    const manager = { role: "manager" };
    expect(can(manager, "products.edit")).toBe(true);
    expect(can(manager, "cms.publish")).toBe(true);
    expect(can(manager, "reports.view")).toBe(true);
    expect(can(manager, "staff.manage")).toBe(false);
    expect(can(manager, "settings.manage")).toBe(false);
  });

  it("owners can do everything", () => {
    expect(can({ role: "owner" }, "integrations.manage")).toBe(true);
    expect(can({ role: "owner" }, "audit.view")).toBe(true);
  });

  it("customers, unknown roles and blocked users get nothing", () => {
    expect(permissionsOf({ role: "customer", permissions: ["orders.confirm"] }).size).toBe(0);
    expect(permissionsOf({ role: "superuser" }).size).toBe(0);
    expect(permissionsOf({ role: "owner", status: "blocked" }).size).toBe(0);
    expect(isStaff({ role: "customer" })).toBe(false);
    expect(isStaff({ role: "manager" })).toBe(true);
  });

  it("extra per-user permissions extend a staff role, unknown strings are ignored", () => {
    const user = { role: "staff", permissions: ["reports.view", "make.coffee"] };
    expect(can(user, "reports.view")).toBe(true);
    expect([...permissionsOf(user)]).not.toContain("make.coffee");
  });
});

/** Minimal in-memory stand-in for the few Redis commands these helpers use. */
function fakeRedis() {
  const store = new Map<string, { v: string; exp: number | null }>();
  const now = () => Date.now();
  const live = (k: string) => {
    const e = store.get(k);
    if (e && e.exp !== null && e.exp <= now()) store.delete(k);
    return store.get(k);
  };
  const ops = {
    incr: (k: string) => {
      const e = live(k);
      const n = Number(e?.v ?? 0) + 1;
      store.set(k, { v: String(n), exp: e?.exp ?? null });
      return n;
    },
    expire: (k: string, s: number, mode?: string) => {
      const e = live(k);
      if (!e || (mode === "NX" && e.exp !== null)) return 0;
      e.exp = now() + s * 1000;
      return 1;
    },
    ttl: (k: string) => {
      const e = live(k);
      return !e ? -2 : e.exp === null ? -1 : Math.ceil((e.exp - now()) / 1000);
    },
    set: (k: string, v: string, _ex?: string, s?: number) => {
      store.set(k, { v, exp: s ? now() + s * 1000 : null });
      return "OK";
    },
    del: (k: string) => (store.delete(k) ? 1 : 0),
    exists: (k: string) => (live(k) ? 1 : 0),
  };
  const client = {
    ...Object.fromEntries(
      Object.entries(ops).map(([n, f]) => [n, async (...a: unknown[]) => (f as (...x: unknown[]) => unknown)(...a)]),
    ),
    multi() {
      const queue: [keyof typeof ops, unknown[]][] = [];
      const chain: Record<string, unknown> = {
        exec: async () => queue.map(([n, a]) => [null, (ops[n] as (...x: unknown[]) => unknown)(...a)]),
      };
      for (const n of Object.keys(ops) as (keyof typeof ops)[]) {
        chain[n] = (...a: unknown[]) => {
          queue.push([n, a]);
          return chain;
        };
      }
      return chain;
    },
  };
  return client as unknown as Redis;
}

describe("sign-in lockout (NFR-SEC-05)", () => {
  it(`locks after ${MAX_FAILED_SIGN_INS} failures and clears on success`, async () => {
    const r = fakeRedis();
    const id = "email:a@b.c";
    for (let i = 1; i < MAX_FAILED_SIGN_INS; i++) {
      expect((await recordFailure(r, id)).locked).toBe(false);
    }
    expect(await isLocked(r, id)).toBe(false);
    expect((await recordFailure(r, id)).locked).toBe(true);
    expect(await isLocked(r, id)).toBe(true);

    const other = "email:x@y.z";
    await recordFailure(r, other);
    await clearFailures(r, other);
    for (let i = 1; i < MAX_FAILED_SIGN_INS; i++) await recordFailure(r, other);
    expect(await isLocked(r, other)).toBe(false);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit within a window", async () => {
    const r = fakeRedis();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit(r, "otp:+8801712345678", 3, 600));
    expect(results.map((x) => x.allowed)).toEqual([true, true, true, false]);
    expect(results[3]?.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("admin route permissions", () => {
  it("maps sections to permissions, longest prefix wins", async () => {
    const { requiredPermission, isPublicAdminPath } = await import("@/modules/auth/admin-routes");
    expect(requiredPermission("/admin")).toBeNull();
    expect(requiredPermission("/admin/staff")).toBe("staff.manage");
    expect(requiredPermission("/admin/staff/123")).toBe("staff.manage");
    expect(requiredPermission("/admin/storefront")).toBe("cms.edit");
    expect(requiredPermission("/admin/appearance")).toBe("cms.edit");
    expect(requiredPermission("/admin/pages/new")).toBe("cms.edit");
    expect(requiredPermission("/admin/messages")).toBe("customers.view");
    expect(requiredPermission("/admin/staffing")).toBeNull();
    expect(requiredPermission("/admin/audit")).toBe("audit.view");
    expect(isPublicAdminPath("/admin/sign-in")).toBe(true);
    expect(isPublicAdminPath("/admin/sign-in-evil")).toBe(false);
    expect(isPublicAdminPath("/admin")).toBe(false);
  });
});
