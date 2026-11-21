import { describe, expect, it } from "vitest";
import { availableMethods, checkoutInput, fieldErrors } from "@/modules/checkout/checkout";
import {
  activeWallets,
  maskTrxId,
  normalizeTrxId,
  paymentSettingsInput,
  readPaymentSettings,
  showBdPhone,
} from "@/modules/payments/payments";

const oid = (n: number) => n.toString(16).padStart(24, "0");

describe("TrxID", () => {
  it("reads it as typed: spaces dropped, upper case", () => {
    expect(normalizeTrxId("9bc4d7ef2a")).toBe("9BC4D7EF2A");
    expect(normalizeTrxId(" 9BC4 D7EF 2A ")).toBe("9BC4D7EF2A");
    expect(normalizeTrxId("71A2B3C4")).toBe("71A2B3C4"); // Nagad-length
  });

  it("refuses what can't be a TrxID", () => {
    expect(normalizeTrxId("ABC123")).toBeNull(); // too short
    expect(normalizeTrxId("ABCDEFGHIJKLM1")).toBeNull(); // too long
    expect(normalizeTrxId("ABCDEFGHIJ")).toBeNull(); // no digit
    expect(normalizeTrxId("9BC4-D7EF2A")).toBeNull();
    expect(normalizeTrxId({ $ne: "" })).toBeNull();
  });

  it("is shown with only the last 4 characters", () => {
    expect(maskTrxId("9BC4D7EF2A")).toBe("••••••EF2A");
    expect(showBdPhone("+8801712345678")).toBe("01712-345678");
  });
});

describe("payment settings", () => {
  const wallet = (patch: Record<string, unknown> = {}) => ({
    type: "bkash",
    number: "01712-345678",
    accountName: "Shop",
    how: "send_money",
    qrUrl: "",
    active: true,
    ...patch,
  });

  it("saves numbers as +880 and keeps one wallet per type", () => {
    const r = paymentSettingsInput.parse({ wallets: [wallet(), wallet({ type: "nagad", active: false, number: "" })] });
    expect(r.wallets[0]!.number).toBe("+8801712345678");
    expect(paymentSettingsInput.safeParse({ wallets: [wallet(), wallet()] }).success).toBe(false);
  });

  it("needs a number before a wallet is switched on, and only our own QR uploads", () => {
    expect(paymentSettingsInput.safeParse({ wallets: [wallet({ number: "" })] }).success).toBe(false);
    expect(paymentSettingsInput.safeParse({ wallets: [wallet({ number: "12345" })] }).success).toBe(false);
    expect(
      paymentSettingsInput.safeParse({ wallets: [wallet({ qrUrl: "https://evil.example/qr.png" })] }).success,
    ).toBe(false);
    expect(paymentSettingsInput.safeParse({ wallets: [wallet({ qrUrl: "/uploads/images/qr-1.png" })] }).success).toBe(
      true,
    );
  });

  it("reads stored settings safely, with both wallets always listed", () => {
    const s = readPaymentSettings({
      wallets: [{ type: "nagad", number: "+8801812345678", how: "payment", active: true }, { type: "rocket" }],
    });
    expect(s.wallets.map((w) => w.type)).toEqual(["bkash", "nagad"]);
    expect(s.wallets[0]).toMatchObject({ number: "", active: false, how: "send_money" });
    expect(s.wallets[1]).toMatchObject({ number: "+8801812345678", how: "payment", active: true });
    expect(activeWallets(s).map((w) => w.type)).toEqual(["nagad"]);
    expect(readPaymentSettings(null).wallets.every((w) => !w.active)).toBe(true);
  });
});

describe("payment options at checkout", () => {
  it("drops the advance options while no wallet is switched on", () => {
    expect(availableMethods("none", 1)).toEqual(["cod", "full"]);
    expect(availableMethods("none", 0)).toEqual(["cod"]);
    expect(availableMethods("delivery", 2)).toEqual(["cod_advance", "full"]);
    expect(availableMethods("delivery", 0)).toEqual([]);
    expect(availableMethods("full", 0)).toEqual([]);
  });
});

const form = {
  name: "Rahim Uddin",
  phone: "01712345678",
  email: "",
  districtId: oid(10),
  areaId: oid(11),
  address: "House 12, Road 5, Dhanmondi",
  note: "",
  acceptTerms: true,
};

describe("advance payment fields", () => {
  it("are required for an advance, with a message at each", () => {
    const r = checkoutInput.safeParse({ ...form, paymentMethod: "cod_advance" });
    expect(r.success).toBe(false);
    const f = fieldErrors(r.error!);
    expect(f).toMatchObject({
      payWallet: "Choose bKash or Nagad",
      senderNumber: expect.stringMatching(/number you sent from/),
      trxId: expect.stringMatching(/TrxID/),
    });
  });

  it("check the sender number and TrxID format", () => {
    const r = checkoutInput.safeParse({
      ...form,
      paymentMethod: "full",
      payWallet: "bkash",
      senderNumber: "12345",
      trxId: "abc",
    });
    const f = fieldErrors(r.error!);
    expect(f.senderNumber).toMatch(/Bangladeshi/);
    expect(f.trxId).toMatch(/8–12 letters and digits/);
  });

  it("are cleaned up when right", () => {
    const r = checkoutInput.parse({
      ...form,
      paymentMethod: "cod_advance",
      payWallet: "nagad",
      senderNumber: "+880 1812-345678",
      trxId: "71a2 b3c4",
    });
    expect(r).toMatchObject({ payWallet: "nagad", senderNumber: "+8801812345678", trxId: "71A2B3C4" });
  });

  it("are dropped for cash on delivery", () => {
    const r = checkoutInput.parse({ ...form, paymentMethod: "cod", payWallet: "bkash", trxId: "junk" });
    expect(r).toMatchObject({ payWallet: "", senderNumber: "", trxId: "" });
  });

  it("refuse other wallets and operator objects", () => {
    const base = { ...form, paymentMethod: "full", senderNumber: "01812345678", trxId: "9BC4D7EF2A" };
    expect(checkoutInput.safeParse({ ...base, payWallet: "rocket" }).success).toBe(false);
    expect(checkoutInput.safeParse({ ...base, payWallet: "bkash", trxId: { $gt: "" } }).success).toBe(false);
  });
});
