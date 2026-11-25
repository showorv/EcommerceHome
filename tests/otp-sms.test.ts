import { describe, expect, it, vi } from "vitest";
import { isOtpPurpose, OTP_JOB_OPTIONS } from "@/lib/queue";
import {
  AlphaSmsProvider,
  ConsoleSmsProvider,
  FallbackSmsProvider,
  SmsSendError,
  type SmsProvider,
} from "@/modules/notifications/sms";
import { hashCode, newCode, readVerifiedPhone, signVerifiedPhone } from "@/modules/otp/codes";
import { normalizeCode, OTP } from "@/modules/otp/rules";

const SECRET = "x".repeat(40);
const PHONE = "+8801712345678";

describe("OTP rules", () => {
  it("matches the SRS: 6 digits, 5 minutes, 5 tries, 3 sends per 10 minutes", () => {
    expect(OTP).toMatchObject({
      length: 6,
      ttlSeconds: 300,
      maxAttempts: 5,
      perPhone: { limit: 3, windowSeconds: 600 },
      perIp: { limit: 10, windowSeconds: 3600 },
    });
  });

  it("reads typed codes, including Bangla digits", () => {
    expect(normalizeCode("123456")).toBe("123456");
    expect(normalizeCode(" 123 456 ")).toBe("123456");
    expect(normalizeCode("১২৩-৪৫৬")).toBe("123456");
    expect(normalizeCode("12345")).toBeNull();
    expect(normalizeCode("1234567")).toBeNull();
    expect(normalizeCode("12a456")).toBeNull();
    expect(normalizeCode({ $ne: "" })).toBeNull();
  });
});

describe("codes and confirmed-number tokens", () => {
  it("makes 6-digit codes", () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^\d{6}$/);
  });

  it("ties a code's hash to the number and purpose", () => {
    const h = hashCode(SECRET, PHONE, "checkout", "123456");
    expect(h).toBe(hashCode(SECRET, PHONE, "checkout", "123456"));
    expect(h).not.toContain("123456");
    expect(hashCode(SECRET, "+8801812345678", "checkout", "123456")).not.toBe(h);
    expect(hashCode(SECRET, PHONE, "login", "123456")).not.toBe(h);
    expect(hashCode("y".repeat(40), PHONE, "checkout", "123456")).not.toBe(h);
  });

  it("accepts its own token until it expires", () => {
    const t = signVerifiedPhone(SECRET, PHONE, "checkout", 2_000);
    expect(readVerifiedPhone(SECRET, t, "checkout", 1_000)).toBe(PHONE);
    expect(readVerifiedPhone(SECRET, t, "checkout", 2_000)).toBeNull();
    expect(readVerifiedPhone(SECRET, t, "login", 1_000)).toBeNull();
  });

  it("refuses forged or changed tokens", () => {
    const t = signVerifiedPhone(SECRET, PHONE, "checkout", 2_000);
    const [, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ p: "+8801999999999", u: "checkout", e: 2_000 })).toString("base64url");
    expect(readVerifiedPhone(SECRET, `${forged}.${sig}`, "checkout", 1_000)).toBeNull();
    expect(readVerifiedPhone("y".repeat(40), t, "checkout", 1_000)).toBeNull();
    expect(readVerifiedPhone(SECRET, `${t}.x`, "checkout", 1_000)).toBeNull();
    expect(readVerifiedPhone(SECRET, undefined, "checkout", 1_000)).toBeNull();
    expect(readVerifiedPhone(SECRET, "garbage", "checkout", 1_000)).toBeNull();
  });
});

const reply = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("Alpha SMS provider", () => {
  it("posts the key, text, number without + and sender ID", async () => {
    const f = reply({ error: 0, msg: "Request successfully submitted", data: { request_id: 4321 } });
    const p = new AlphaSmsProvider("KEY", "SHOPBD", "https://sms.test/send", f);
    await expect(p.send(PHONE, "Hello")).resolves.toEqual({ provider: "alpha", providerMessageId: "4321" });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://sms.test/send");
    const body = init!.body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({
      api_key: "KEY",
      msg: "Hello",
      to: "8801712345678",
      sender_id: "SHOPBD",
    });
  });

  it("leaves the sender ID out when none is set", async () => {
    const f = reply({ error: 0, data: { request_id: 1 } });
    await new AlphaSmsProvider("KEY", undefined, "https://sms.test/send", f).send(PHONE, "Hi");
    expect((f.mock.calls[0]![1]!.body as URLSearchParams).has("sender_id")).toBe(false);
  });

  it("stops retrying on a bad key or number, retries on low balance or a server error", async () => {
    const send = (body: unknown, status?: number) =>
      new AlphaSmsProvider("KEY", undefined, "https://sms.test/send", reply(body, status))
        .send(PHONE, "Hi")
        .catch((e: SmsSendError) => e);
    const bad = await send({ error: 405, msg: "Authorization required" });
    expect(bad).toBeInstanceOf(SmsSendError);
    expect(bad).toMatchObject({ permanent: true, code: 405 });
    expect(await send({ error: "416" })).toMatchObject({ permanent: true, code: 416 });
    expect(await send({ error: 417 })).toMatchObject({ permanent: false, code: 417 });
    expect(await send({}, 502)).toMatchObject({ permanent: false });
    expect(await send("not json")).toMatchObject({ permanent: false });
  });

  it("treats a network failure as worth retrying", async () => {
    const f = vi.fn<typeof fetch>().mockRejectedValue(new Error("ECONNRESET"));
    const e = await new AlphaSmsProvider("KEY", undefined, "https://sms.test/send", f)
      .send(PHONE, "Hi")
      .catch((x) => x);
    expect(e).toMatchObject({ permanent: false });
  });
});

describe("fallback provider", () => {
  const failing = (permanent: boolean): SmsProvider => ({
    name: permanent ? "dead" : "flaky",
    send: () => Promise.reject(new SmsSendError("nope", "x", permanent)),
  });

  it("uses the next provider when the first fails", async () => {
    const p = new FallbackSmsProvider([failing(true), new ConsoleSmsProvider()]);
    expect(p.name).toBe("dead→console");
    await expect(p.send(PHONE, "Hi")).resolves.toMatchObject({ provider: "console" });
  });

  it("is permanent only when every provider failed permanently", async () => {
    await expect(new FallbackSmsProvider([failing(true), failing(true)]).send(PHONE, "Hi")).rejects.toMatchObject({
      permanent: true,
    });
    await expect(new FallbackSmsProvider([failing(true), failing(false)]).send(PHONE, "Hi")).rejects.toMatchObject({
      permanent: false,
    });
  });
});

describe("code SMS jobs", () => {
  it("go first, give up fast and are not kept", () => {
    expect(isOtpPurpose("otp")).toBe(true);
    expect(isOtpPurpose("checkout_otp")).toBe(true);
    expect(isOtpPurpose("password_reset_otp")).toBe(true);
    expect(isOtpPurpose("order_confirmed")).toBe(false);
    expect(isOtpPurpose("otpish")).toBe(false);
    expect(OTP_JOB_OPTIONS).toMatchObject({ priority: 1, attempts: 3, removeOnComplete: true });
  });
});
