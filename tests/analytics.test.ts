import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storefrontCsp } from "@/lib/security-headers";
import {
  ga4Event,
  metaEvent,
  purchaseEventId,
  tiktokEvent,
  trackingOn,
  type ShopEvent,
} from "@/modules/analytics/events";
import { checkIntegration } from "@/modules/integrations/integrations";

const settings = vi.hoisted(() => ({
  current: {
    metaPixelId: "123456789012345" as string | null,
    metaCapiToken: "token-abc" as string | null,
    metaTestCode: null as string | null,
    ga4Id: null as string | null,
    tiktokPixelId: null as string | null,
  },
}));
vi.mock("@/modules/integrations/store", () => ({ analyticsSettings: async () => settings.current }));
const queued = vi.hoisted(() => [] as unknown[]);
vi.mock("@/lib/queue", () => ({ enqueueMetaEvent: async (job: unknown) => queued.push(job) }));

const { hashedUserData, MetaSendError, purchaseJob, queuePurchaseEvent, sendMetaEvent } =
  await import("@/modules/analytics/capi");

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const order: ShopEvent = {
  name: "purchase",
  orderNo: "SR10042",
  value: 309_100,
  items: [
    { id: "p1", name: "Chopper", price: 145_000, qty: 2 },
    { id: "p2", name: "Lamp", price: 20_000, qty: 1 },
  ],
};

describe("shop events for each pixel", () => {
  it("says a purchase the way Meta wants it, in taka, with the shared event id", () => {
    const m = metaEvent(order);
    expect(m.name).toBe("Purchase");
    expect(m.eventId).toBe("order-SR10042");
    expect(m.data).toMatchObject({
      content_ids: ["p1", "p2"],
      contents: [
        { id: "p1", quantity: 2, item_price: 1450 },
        { id: "p2", quantity: 1, item_price: 200 },
      ],
      num_items: 3,
      value: 3091,
      currency: "BDT",
      order_id: "SR10042",
    });
  });

  it("uses GA4's and TikTok's own names", () => {
    expect(ga4Event(order)).toMatchObject({ name: "purchase", params: { transaction_id: "SR10042", value: 3091 } });
    expect(ga4Event({ ...order, name: "view_item", orderNo: undefined }).params).not.toHaveProperty("transaction_id");
    expect(tiktokEvent(order)).toMatchObject({ name: "CompletePayment", eventId: purchaseEventId("SR10042") });
    expect(metaEvent({ ...order, name: "add_to_cart", orderNo: undefined }).eventId).toBeUndefined();
  });

  it("is off until an ID is saved", () => {
    expect(trackingOn({ metaPixelId: null, ga4Id: null, tiktokPixelId: null })).toBe(false);
    expect(trackingOn({ metaPixelId: null, ga4Id: "G-ABC123", tiktokPixelId: null })).toBe(true);
  });
});

describe("admin settings", () => {
  const ok = (values: Record<string, string>, token = false) =>
    checkIntegration("analytics", values, { metaCapiToken: token });
  it("accepts any one tracker and checks each ID's form", () => {
    expect(ok({ ga4Id: "G-ABCD1234" })).toBeNull();
    expect(ok({ metaPixelId: "123456789012345" }, true)).toBeNull();
    expect(ok({})).toMatch(/at least one/);
    expect(ok({ metaPixelId: "12ab" })).toMatch(/Pixel ID/);
    expect(ok({ ga4Id: "UA-1234" })).toMatch(/GA4/);
    expect(ok({ tiktokPixelId: "short" })).toMatch(/TikTok/);
    expect(ok({ ga4Id: "G-ABCD1234" }, true)).toMatch(/needs the Meta Pixel ID/);
    expect(ok({ metaPixelId: "123456789012345", metaTestCode: "abc" })).toMatch(/TEST/);
  });
});

describe("Meta Conversions API", () => {
  beforeEach(() => {
    queued.length = 0;
    settings.current = { ...settings.current, metaPixelId: "123456789012345", metaCapiToken: "token-abc" };
  });

  const user = {
    phone: "+8801712345678",
    email: " Rahim@Example.com ",
    ip: "103.1.2.3",
    userAgent: "UA",
    fbp: "fb.1.1.1",
    fbc: null,
  };

  it("hashes the customer's details the way Meta asks", () => {
    const u = hashedUserData(user);
    expect(u.ph).toEqual([sha("8801712345678")]);
    expect(u.em).toEqual([sha("rahim@example.com")]);
    expect(u.country).toEqual([sha("bd")]);
    expect(u).toMatchObject({ client_ip_address: "103.1.2.3", fbp: "fb.1.1.1" });
    expect(u).not.toHaveProperty("fbc");
    expect(JSON.stringify(u)).not.toContain('1712345678"');
    expect(hashedUserData({ ...user, email: "" })).not.toHaveProperty("em");
  });

  it("queues an order only when the pixel and key are saved", async () => {
    const o = {
      orderNo: "SR10042",
      placedAt: new Date("2026-11-23T10:00:00Z"),
      total: 309_100,
      items: order.items,
      url: "https://shop.example.com/checkout",
      user,
    };
    expect(await queuePurchaseEvent(o)).toBe(true);
    expect(queued[0]).toMatchObject({ eventName: "Purchase", eventId: "order-SR10042", eventTime: 1795428000 });
    settings.current = { ...settings.current, metaCapiToken: null };
    expect(await queuePurchaseEvent(o)).toBe(false);
    expect(queued).toHaveLength(1);
  });

  it("sends the event with the key in the body, and sorts errors", async () => {
    const job = purchaseJob({ orderNo: "SR10042", placedAt: new Date(), total: 1000, items: [], url: "u", user });
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const reply = (status: number, body: unknown) =>
      (async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify(body), { status });
      }) as unknown as typeof fetch;

    expect(await sendMetaEvent(job, reply(200, { events_received: 1 }))).toEqual({ received: 1 });
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v23.0/123456789012345/events");
    expect(calls[0]!.url).not.toContain("token");
    expect(calls[0]!.body).toMatchObject({
      access_token: "token-abc",
      data: [{ event_id: "order-SR10042", action_source: "website" }],
    });

    const bad = await sendMetaEvent(job, reply(400, { error: { message: "Invalid OAuth access token" } })).catch(
      (e) => e,
    );
    expect(bad).toBeInstanceOf(MetaSendError);
    expect(bad.permanent).toBe(true);
    const busy = await sendMetaEvent(job, reply(503, {})).catch((e) => e);
    expect(busy.permanent).toBe(false);

    settings.current = { ...settings.current, metaCapiToken: null };
    expect(await sendMetaEvent(job, reply(200, {}))).toEqual({ skipped: "Conversions API is off" });
  });
});

describe("content security policy", () => {
  it("lets the pixel scripts load on the storefront only from their own hosts", () => {
    const csp = storefrontCsp(false, true);
    const script = csp.split("; ").find((d) => d.startsWith("script-src "))!;
    expect(script).toContain("https://connect.facebook.net");
    expect(script).toContain("https://www.googletagmanager.com");
    expect(script).toContain("https://analytics.tiktok.com");
    expect(script).not.toContain("*");
  });
});
