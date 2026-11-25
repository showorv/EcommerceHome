import { describe, expect, it } from "vitest";
import { scrubEvent, SENTRY_COMMON } from "@/modules/monitoring/scrub";

describe("error reports carry no personal data", () => {
  it("keeps the page address and drops everything about the visitor", () => {
    const e = scrubEvent({
      message: "boom",
      server_name: "web-1",
      user: { ip_address: "103.1.2.3" },
      request: {
        url: "https://shop.example.com/track?phone=01712345678",
        query_string: "phone=01712345678",
        cookies: { cart: "x" },
        headers: { cookie: "a", "x-real-ip": "103.1.2.3" },
        data: { phone: "01712345678" },
      },
    });
    expect(e).toEqual({ message: "boom", request: { url: "https://shop.example.com/track" } });
  });

  it("never sends default personal data or performance traces", () => {
    expect(SENTRY_COMMON).toMatchObject({ sendDefaultPii: false, tracesSampleRate: 0 });
  });
});
