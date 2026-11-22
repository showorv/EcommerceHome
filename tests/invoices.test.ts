import { describe, expect, it } from "vitest";
import { randomToken } from "@/lib/crypto";
import { requiredPermission } from "@/modules/auth/admin-routes";
import { invoiceHtml } from "@/modules/invoices/html";
import {
  dhakaYear,
  formatInvoiceNo,
  invoiceCounter,
  invoiceDate,
  invoiceLinkSms,
  invoiceSettingsInput,
  invoiceSnapshot,
  invoiceUrl,
  isInvoiceNo,
  isInvoiceToken,
  linkState,
  readInvoiceSettings,
  TOKEN_BYTES,
} from "@/modules/invoices/invoices";
import { orderConfirmedSms } from "@/modules/orders/staff";

const settings = readInvoiceSettings({ phone: "01711111111", address: "Dhaka" }, "Shop");

const order = {
  _id: "6b0000000000000000000001",
  orderNo: "SR10234",
  createdAt: new Date("2026-11-20T10:00:00Z"),
  customer: { name: "রহিম উদ্দিন", phone: "+8801712345678", email: "" },
  shippingAddress: { line: "বাড়ি ১২, রোড ৩", area: "Mirpur", district: "Dhaka" },
  zoneName: "Inside Dhaka",
  items: [{ title: "Chopper", variantTitle: "Red", sku: "CH-R", qty: 2, price: 50000, cost: 30000 }],
  subtotal: 100000,
  discount: 10000,
  couponCode: "SAVE10",
  deliveryCharge: 7000,
  codFee: 0,
  total: 97000,
  paymentMethod: "cod_advance",
  advance: { method: "bkash", amount: 7000, trxId: "9ABC12XYZ7", senderNumber: "+8801799999999", status: "verified" },
  codAmount: 90000,
};

describe("invoice numbers", () => {
  it("is one sequence per Dhaka year, six digits", () => {
    expect(invoiceCounter(2026)).toBe("invoice-2026");
    expect(formatInvoiceNo(2026, 123)).toBe("INV-2026-000123");
    expect(formatInvoiceNo(2026, 1234567)).toBe("INV-2026-1234567");
    expect(isInvoiceNo("INV-2026-000123")).toBe(true);
    expect(isInvoiceNo("INV-26-1")).toBe(false);
  });

  it("turns the year at Dhaka midnight", () => {
    expect(dhakaYear(new Date("2026-12-31T17:59:59Z"))).toBe(2026);
    expect(dhakaYear(new Date("2026-12-31T18:00:00Z"))).toBe(2027);
    expect(invoiceDate("2026-12-31T18:30:00Z")).toBe("1 Jan 2027");
  });
});

describe("invoice links", () => {
  it("tokens are 22 url-safe characters", () => {
    const t = randomToken(TOKEN_BYTES);
    expect(isInvoiceToken(t)).toBe(true);
    expect(isInvoiceToken(t + "x")).toBe(false);
    expect(isInvoiceToken("../../etc/passwd/aaaaaa")).toBe(false);
    expect(invoiceUrl("https://shop.example/", t)).toBe(`https://shop.example/i/${t}`);
  });

  it("knows when a link stops working", () => {
    const now = Date.parse("2026-11-22T00:00:00Z");
    expect(linkState({ revokedAt: null, tokenExpiresAt: "2026-11-23T00:00:00Z" }, now)).toBe("active");
    expect(linkState({ revokedAt: null, tokenExpiresAt: "2026-11-22T00:00:00Z" }, now)).toBe("expired");
    expect(linkState({ revokedAt: "2026-11-21T00:00:00Z", tokenExpiresAt: "2027-01-01T00:00:00Z" }, now)).toBe(
      "revoked",
    );
  });

  it("puts the link in the confirmation SMS, or a new link in its own SMS", () => {
    expect(orderConfirmedSms(order, "Shop", "https://s.bd/i/abc")).toBe(
      "Shop: Order #SR10234 confirmed. Total ৳970 (COD ৳900). Invoice: https://s.bd/i/abc",
    );
    expect(invoiceLinkSms("SR10234", "Shop", "https://s.bd/i/abc")).toBe(
      "Shop: Your invoice for order #SR10234: https://s.bd/i/abc",
    );
  });

  it("invoice settings are managed with the shop settings", () => {
    expect(requiredPermission("/admin/invoices")).toBe("settings.manage");
  });
});

describe("invoice settings", () => {
  it("falls back to defaults and the store name", () => {
    expect(readInvoiceSettings(undefined, "Shop")).toMatchObject({ shopName: "Shop", linkDays: 90 });
    expect(readInvoiceSettings({ linkDays: -4 }, "Shop")).toMatchObject({ linkDays: 90 });
    expect(settings).toMatchObject({ shopName: "Shop", phone: "01711111111", address: "Dhaka" });
  });

  it("checks what staff type", () => {
    const base = { shopName: "Shop", phone: "", email: "", address: "", footer: "", linkDays: "30" };
    expect(invoiceSettingsInput.parse(base).linkDays).toBe(30);
    expect(invoiceSettingsInput.safeParse({ ...base, linkDays: "0" }).success).toBe(false);
    expect(invoiceSettingsInput.safeParse({ ...base, linkDays: "1.5" }).success).toBe(false);
    expect(invoiceSettingsInput.safeParse({ ...base, email: "nope" }).success).toBe(false);
    expect(invoiceSettingsInput.parse({ ...base, footer: "  a \n  b " }).footer).toBe("a b");
  });
});

describe("invoice snapshot", () => {
  const snap = invoiceSnapshot(
    order,
    { invoiceNo: "INV-2026-000001", issuedAt: new Date("2026-11-21T08:00:00Z"), paymentMethodName: "COD + advance" },
    settings,
  );

  it("keeps what the invoice shows, without costs or the full TrxID", () => {
    expect(snap.customer.phone).toBe("01712345678");
    expect(snap.items).toEqual([{ title: "Chopper", variantTitle: "Red", sku: "CH-R", qty: 2, price: 50000 }]);
    expect(snap.advance).toEqual({ method: "bkash", amount: 7000, trxLast4: "XYZ7" });
    expect(JSON.stringify(snap)).not.toContain("9ABC12XYZ7");
    expect(JSON.stringify(snap)).not.toContain("+8801799999999");
    expect(snap).toMatchObject({ total: 97000, codAmount: 90000, discount: 10000, couponCode: "SAVE10" });
  });

  it("leaves out an advance that never arrived", () => {
    const s = invoiceSnapshot(
      { ...order, advance: { ...order.advance, status: "not_found" } },
      { invoiceNo: "INV-2026-000002", issuedAt: new Date(), paymentMethodName: "COD" },
      settings,
    );
    expect(s.advance).toBeNull();
  });

  it("prints Bangla as is and escapes everything", () => {
    const evil = { ...snap, customer: { ...snap.customer, name: `<script>alert("x")</script>` } };
    const html = invoiceHtml(evil, { link: "https://s.bd/i/abc", qrSvg: "<svg></svg>", fontCss: "" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("বাড়ি ১২, রোড ৩");
    expect(html).toContain("TrxID …XYZ7");
    expect(html).toContain("INV-2026-000001");
  });
});
