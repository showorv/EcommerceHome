import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "@/lib/same-origin";

const APP = "https://shop.example.com";
const h = (init: Record<string, string>) => new Headers(init);

describe("same-origin check for route handlers (NFR-SEC-12)", () => {
  it("trusts the browser's Sec-Fetch-Site first", () => {
    expect(isSameOriginRequest(h({ "sec-fetch-site": "same-origin" }), APP)).toBe(true);
    expect(isSameOriginRequest(h({ "sec-fetch-site": "cross-site", origin: APP }), APP)).toBe(false);
    expect(isSameOriginRequest(h({ "sec-fetch-site": "same-site" }), APP)).toBe(false);
    expect(isSameOriginRequest(h({ "sec-fetch-site": "none" }), APP)).toBe(false);
  });

  it("falls back to Origin", () => {
    expect(isSameOriginRequest(h({ origin: APP }), APP)).toBe(true);
    expect(isSameOriginRequest(h({ origin: `${APP}/` }), APP + "/admin")).toBe(true);
    expect(isSameOriginRequest(h({ origin: "https://evil.example" }), APP)).toBe(false);
    expect(isSameOriginRequest(h({ origin: "http://shop.example.com" }), APP)).toBe(false);
    expect(isSameOriginRequest(h({ origin: "null" }), APP)).toBe(false);
  });

  it("refuses requests that say nothing", () => {
    expect(isSameOriginRequest(h({}), APP)).toBe(false);
  });
});
