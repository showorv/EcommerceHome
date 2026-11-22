import { describe, expect, it } from "vitest";
import { requiredPermission } from "@/modules/auth/admin-routes";
import { can } from "@/modules/auth/rbac";
import {
  checkIntegration,
  defOf,
  fieldApplies,
  integrationInput,
  maskValue,
  readStored,
  secretKeys,
} from "@/modules/integrations/integrations";

const none = {};

describe("integration definitions", () => {
  it("marks the keys that are secret", () => {
    expect(secretKeys("sms")).toEqual(["alphaApiKey"]);
    expect(secretKeys("email")).toEqual(["smtpPass", "resendApiKey"]);
    expect(secretKeys("courier")).toEqual(["steadfastApiKey", "steadfastSecretKey"]);
    expect(secretKeys("storage")).toEqual(["apiSecret"]);
  });

  it("shows fields only for the chosen provider", () => {
    const sms = defOf("sms").fields.find((f) => f.key === "alphaApiKey")!;
    expect(fieldApplies(sms, { provider: "console" })).toBe(false);
    expect(fieldApplies(sms, { provider: "console", fallback: "alpha" })).toBe(true);
    const resend = defOf("email").fields.find((f) => f.key === "resendApiKey")!;
    expect(fieldApplies(resend, { provider: "smtp" })).toBe(false);
    expect(fieldApplies(resend, { provider: "resend" })).toBe(true);
  });
});

describe("reading what is stored", () => {
  it("keeps only known keys and strings", () => {
    const s = readStored("sms", {
      source: "admin",
      values: { provider: "alpha", senderId: 5, evil: "x" },
      secrets: { alphaApiKey: "v1.a.b.c", other: "v1.x" },
      updatedAt: new Date("2026-11-22T10:00:00Z"),
      updatedByName: "Owner",
    });
    expect(s).toEqual({
      source: "admin",
      values: { provider: "alpha" },
      secrets: { alphaApiKey: "v1.a.b.c" },
      updatedAt: "2026-11-22T10:00:00.000Z",
      updatedByName: "Owner",
    });
  });

  it("defaults to the environment", () => {
    expect(readStored("email", undefined)).toMatchObject({ source: "env", values: {}, secrets: {} });
    expect(readStored("email", { source: "$where" }).source).toBe("env");
  });
});

describe("checking a save", () => {
  it("SMS", () => {
    expect(checkIntegration("sms", { provider: "console" }, none)).toBeNull();
    expect(checkIntegration("sms", {}, none)).toMatch(/Choose/);
    expect(checkIntegration("sms", { provider: "alpha" }, none)).toMatch(/API key/);
    expect(checkIntegration("sms", { provider: "alpha" }, { alphaApiKey: true })).toBeNull();
    expect(checkIntegration("sms", { provider: "console", fallback: "alpha" }, none)).toMatch(/API key/);
    expect(checkIntegration("sms", { provider: "alpha", fallback: "alpha" }, { alphaApiKey: true })).toMatch(
      /different/,
    );
    expect(checkIntegration("sms", { provider: "alpha", senderId: "<script>" }, { alphaApiKey: true })).toMatch(
      /Sender ID/,
    );
  });

  it("email", () => {
    const smtp = {
      provider: "smtp",
      from: "Shop <no-reply@mail.shop.bd>",
      smtpHost: "smtp.example.com",
      smtpPort: "587",
    };
    expect(checkIntegration("email", smtp, none)).toBeNull();
    expect(checkIntegration("email", { ...smtp, from: "nobody" }, none)).toMatch(/From/);
    expect(checkIntegration("email", { ...smtp, smtpPort: "99999" }, none)).toMatch(/port/);
    expect(checkIntegration("email", { ...smtp, smtpHost: "bad host" }, none)).toMatch(/host/);
    expect(checkIntegration("email", { ...smtp, smtpUser: "u" }, none)).toMatch(/together/);
    expect(checkIntegration("email", { ...smtp, smtpUser: "u" }, { smtpPass: true })).toBeNull();
    expect(checkIntegration("email", { provider: "resend", from: "hi@shop.bd" }, none)).toMatch(/Resend/);
    expect(checkIntegration("email", { provider: "resend", from: "hi@shop.bd" }, { resendApiKey: true })).toBeNull();
  });

  it("courier and storage need their keys together", () => {
    expect(checkIntegration("courier", {}, none)).toBeNull();
    expect(checkIntegration("courier", {}, { steadfastApiKey: true })).toMatch(/both/);
    expect(checkIntegration("courier", {}, { steadfastApiKey: true, steadfastSecretKey: true })).toBeNull();
    expect(checkIntegration("storage", { cloudName: "shop" }, none)).toMatch(/together/);
    expect(checkIntegration("storage", { cloudName: "shop", apiKey: "123" }, { apiSecret: true })).toBeNull();
    expect(checkIntegration("storage", { cloudName: "a b", apiKey: "1" }, { apiSecret: true })).toMatch(/Cloud name/);
  });

  it("parses the browser's input", () => {
    expect(integrationInput.safeParse({ id: "sms", source: "admin" }).success).toBe(true);
    expect(integrationInput.safeParse({ id: "payments", source: "admin" }).success).toBe(false);
    expect(integrationInput.safeParse({ id: "sms", source: "admin", values: { provider: { $ne: 1 } } }).success).toBe(
      false,
    );
  });
});

describe("masking and access", () => {
  it("never shows more than the last 4 characters", () => {
    expect(maskValue("re_1234567890abcd")).toBe("••••••••abcd");
    expect(maskValue("short")).toBe("••••••••");
  });

  it("only the owner manages integrations", () => {
    expect(requiredPermission("/admin/integrations")).toBe("integrations.manage");
    expect(can({ role: "owner" }, "integrations.manage")).toBe(true);
    expect(can({ role: "manager" }, "integrations.manage")).toBe(false);
    expect(can({ role: "staff" }, "integrations.manage")).toBe(false);
  });
});
