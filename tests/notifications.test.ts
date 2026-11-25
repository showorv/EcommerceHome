import { describe, expect, it, vi } from "vitest";
import { requiredPermission } from "@/modules/auth/admin-routes";
import { EmailSendError, errorText, ResendEmailProvider } from "@/modules/notifications/email";
import { paragraphs, renderEmailHtml } from "@/modules/notifications/email-layout";
import {
  DEFAULT_TEMPLATES,
  EVENT_INFO,
  EVENTS,
  fillTemplate,
  isPrivatePurpose,
  LANGUAGES,
  messageMoney,
  purposeName,
  readNotificationSettings,
  sampleVars,
  smsLength,
  templateSaveInput,
  unknownPlaceholders,
  type TemplateSave,
} from "@/modules/notifications/templates";

describe("message templates", () => {
  it("fills placeholders and leaves unknown ones empty", () => {
    expect(
      fillTemplate("{store}: Order #{order_no} for {name}{nope}", { store: "Shop", order_no: "SR1", name: "Rahim" }),
    ).toBe("Shop: Order #SR1 for Rahim");
    expect(unknownPlaceholders("{order_no} {invoice_link} {foo}", EVENT_INFO.order_received.placeholders)).toEqual([
      "invoice_link",
      "foo",
    ]);
  });

  it("writes money so an English SMS stays in the cheap alphabet", () => {
    expect(messageMoney(145000, "sms", "en")).toBe("Tk 1,450");
    expect(messageMoney(145050, "sms", "bn")).toBe("৳1,451");
    expect(messageMoney(145000, "email", "en")).toBe("৳1,450");
  });

  it("every default uses only its own placeholders and fits a sensible SMS", () => {
    for (const e of EVENTS) {
      for (const l of LANGUAGES) {
        const t = DEFAULT_TEMPLATES[e];
        for (const text of [t.sms[l], t.email[l].subject, t.email[l].body]) {
          expect(unknownPlaceholders(text, EVENT_INFO[e].placeholders)).toEqual([]);
        }
        const sms = smsLength(fillTemplate(t.sms[l], sampleVars("China Import Store", "sms", l)));
        expect(sms.segments).toBeLessThanOrEqual(l === "en" ? 1 : 3);
        expect(sms.unicode).toBe(l === "bn");
      }
    }
  });
});

describe("SMS length", () => {
  it("counts plain and Unicode segments", () => {
    expect(smsLength("a".repeat(160))).toMatchObject({ unicode: false, segments: 1 });
    expect(smsLength("a".repeat(161))).toMatchObject({ unicode: false, segments: 2, perSegment: 153 });
    expect(smsLength("{}".repeat(40))).toMatchObject({ length: 160, segments: 1 }); // extended characters count twice
    expect(smsLength("৳" + "a".repeat(69))).toMatchObject({ unicode: true, segments: 1 });
    expect(smsLength("অ".repeat(71))).toMatchObject({ unicode: true, segments: 2, perSegment: 67 });
    expect(smsLength("")).toMatchObject({ segments: 0 });
  });
});

describe("message settings", () => {
  it("falls back to English and each event's defaults", () => {
    const s = readNotificationSettings(undefined);
    expect(s.language).toBe("en");
    expect(s.enabled.order_confirmed).toEqual({ sms: true, email: true });
    expect(s.enabled.order_cancelled).toEqual({ sms: false, email: true });
    const t = readNotificationSettings({
      language: "bn",
      enabled: { order_cancelled: { sms: true }, order_shipped: "x" },
    });
    expect(t.language).toBe("bn");
    expect(t.enabled.order_cancelled).toEqual({ sms: true, email: true });
    expect(t.enabled.order_shipped).toEqual({ sms: true, email: true });
    expect(readNotificationSettings({ language: "fr" }).language).toBe("en");
  });

  it("checks what staff save", () => {
    const base: TemplateSave = {
      event: "order_received",
      enabled: { sms: true, email: false },
      sms: { ...DEFAULT_TEMPLATES.order_received.sms },
      email: { ...DEFAULT_TEMPLATES.order_received.email },
    };
    expect(templateSaveInput.safeParse(base).success).toBe(true);
    const wrong = templateSaveInput.safeParse({ ...base, sms: { ...base.sms, bn: "{invoice_link}" } });
    expect(wrong.success).toBe(false);
    expect(wrong.error?.issues[0]?.message).toContain("{invoice_link} can't be used here");
    expect(templateSaveInput.safeParse({ ...base, sms: { ...base.sms, en: "   " } }).success).toBe(false);
    expect(templateSaveInput.safeParse({ ...base, event: "order_paid" }).success).toBe(false);
    const ok = templateSaveInput.parse({
      ...base,
      email: { ...base.email, en: { subject: " Hi \n there ", body: " Body " } },
    });
    expect(ok.email.en).toEqual({ subject: "Hi there", body: "Body" });
  });

  it("message texts need the settings permission, the log only orders", () => {
    expect(requiredPermission("/admin/notifications")).toBe("orders.view");
    expect(requiredPermission("/admin/notifications/templates")).toBe("settings.manage");
  });
});

describe("the log", () => {
  it("keeps codes and sign-in links private", () => {
    for (const p of ["otp", "checkout_otp", "password_reset_otp", "password_reset", "verify_email"]) {
      expect(isPrivatePurpose(p)).toBe(true);
    }
    expect(isPrivatePurpose("order_confirmed")).toBe(false);
    expect(purposeName("order_confirmed")).toBe("Order confirmed");
    expect(purposeName("checkout_otp")).toBe("Checkout code");
    expect(purposeName("something_new")).toBe("something new");
  });
});

describe("email layout", () => {
  const brand = { name: "Shop & Co", phone: "01700000000", email: "", address: "Dhaka" };

  it("splits paragraphs on blank lines", () => {
    expect(paragraphs("Hi\n\nLine 1\nLine 2\n \n\nEnd")).toEqual([["Hi"], ["Line 1", "Line 2"], ["End"]]);
  });

  it("renders text safely, with links, the button and the shop details", async () => {
    const html = await renderEmailHtml(brand, {
      subject: "Order #SR1 confirmed",
      text: "প্রিয় <b>রহিম</b>,\n\nSee https://shop.example/i/abc today.",
      button: { label: "View invoice", url: "https://shop.example/i/abc" },
    });
    expect(html).toContain("প্রিয় &lt;b&gt;রহিম&lt;/b&gt;");
    expect(html).not.toContain("<b>রহিম</b>");
    expect(html).toMatch(/<a[^>]+href="https:\/\/shop\.example\/i\/abc"/);
    expect(html).toContain("View invoice");
    expect(html).toContain("Shop &amp; Co");
    expect(html).toContain("01700000000 · Dhaka");
  });
});

describe("Resend", () => {
  const ok = () => new Response(JSON.stringify({ id: "re_123" }), { status: 200 });

  it("sends with the key, text, HTML and attachments", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => ok());
    const p = new ResendEmailProvider("re_key", "Shop <hi@mail.shop.bd>", fetchImpl);
    const res = await p.send({
      to: "a@b.bd",
      subject: "S",
      text: "T",
      html: "<p>T</p>",
      attachments: [{ filename: "INV-1.pdf", content: Buffer.from("PDF"), contentType: "application/pdf" }],
    });
    expect(res).toEqual({ provider: "resend", providerMessageId: "re_123" });
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer re_key");
    const body = JSON.parse(String(init!.body));
    expect(body).toMatchObject({
      from: "Shop <hi@mail.shop.bd>",
      to: ["a@b.bd"],
      subject: "S",
      text: "T",
      html: "<p>T</p>",
    });
    expect(body.attachments[0]).toEqual({
      filename: "INV-1.pdf",
      content: Buffer.from("PDF").toString("base64"),
      content_type: "application/pdf",
    });
  });

  it("stops retrying only when retrying can't help", async () => {
    const answer = (status: number) =>
      new ResendEmailProvider(
        "k",
        "f",
        (async () => new Response(JSON.stringify({ message: "nope" }), { status })) as unknown as typeof fetch,
      );
    await expect(answer(422).send({ to: "x", subject: "s", text: "t" })).rejects.toMatchObject({ permanent: true });
    await expect(answer(401).send({ to: "x", subject: "s", text: "t" })).rejects.toMatchObject({ permanent: true });
    await expect(answer(429).send({ to: "x", subject: "s", text: "t" })).rejects.toMatchObject({ permanent: false });
    await expect(answer(503).send({ to: "x", subject: "s", text: "t" })).rejects.toBeInstanceOf(EmailSendError);
    const offline = new ResendEmailProvider("k", "f", (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch);
    await expect(offline.send({ to: "x", subject: "s", text: "t" })).rejects.toMatchObject({ permanent: false });
  });
});

describe("error text", () => {
  it("explains a refused connection, whose message is empty", () => {
    const refused = Object.assign(
      new AggregateError(
        [new Error("connect ECONNREFUSED ::1:1025"), new Error("connect ECONNREFUSED 127.0.0.1:1025")],
        "",
      ),
      { code: "ECONNREFUSED" },
    );
    expect(errorText(refused)).toBe("connect ECONNREFUSED ::1:1025; connect ECONNREFUSED 127.0.0.1:1025");
    expect(errorText(Object.assign(new Error(""), { code: "ETIMEDOUT" }))).toBe("ETIMEDOUT");
    expect(errorText(new Error("Greeting never received"))).toBe("Greeting never received");
    expect(errorText("plain")).toBe("plain");
  });
});
