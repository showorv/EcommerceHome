import { describe, expect, it } from "vitest";
import { readOwnerSettings } from "@/modules/auth/owner-from-env";

describe("owner account from settings", () => {
  it("does nothing when not set up", () => {
    expect(readOwnerSettings({})).toBeNull();
    expect(readOwnerSettings({ OWNER_EMAIL: " ", OWNER_PASSWORD: "" })).toBeNull();
  });

  it("reads a valid owner, tidying the email and defaulting the name", () => {
    const r = readOwnerSettings({ OWNER_EMAIL: " Boss@Example.COM ", OWNER_PASSWORD: "correct horse 42" });
    expect(r).toEqual({ ok: true, owner: { email: "boss@example.com", password: "correct horse 42", name: "Owner" } });
    const named = readOwnerSettings({ OWNER_EMAIL: "a@b.co", OWNER_PASSWORD: "x".repeat(10), OWNER_NAME: " Rahim " });
    expect(named && named.ok && named.owner.name).toBe("Rahim");
  });

  it("explains what is wrong without echoing the password", () => {
    const half = readOwnerSettings({ OWNER_EMAIL: "a@b.co" });
    expect(half).toEqual({ ok: false, errors: ["Set both OWNER_EMAIL and OWNER_PASSWORD (or neither)."] });
    const bad = readOwnerSettings({ OWNER_EMAIL: "not-an-email", OWNER_PASSWORD: "short1" });
    expect(bad?.ok).toBe(false);
    const errors = bad && !bad.ok ? bad.errors.join(" ") : "";
    expect(errors).toMatch(/valid email/);
    expect(errors).toMatch(/at least 10/);
    expect(errors).not.toContain("short1");
  });
});
