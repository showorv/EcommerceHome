import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHARE_IMAGE,
  organizationJsonLd,
  robotsFor,
  searchIndexing,
  shareMeta,
  sitemapFor,
  websiteJsonLd,
} from "@/modules/seo/site";

const BASE = "https://shop.example.com";

describe("search indexing", () => {
  it("is on for https, off for plain http, and can be forced", () => {
    expect(searchIndexing(undefined, BASE)).toBe(true);
    expect(searchIndexing(undefined, "http://localhost:3000")).toBe(false);
    expect(searchIndexing("off", BASE)).toBe(false);
    expect(searchIndexing("on", "http://localhost:3000")).toBe(true);
  });

  it("robots.txt keeps private pages out and points to the sitemap", () => {
    const r = robotsFor(true, BASE);
    const rule = Array.isArray(r.rules) ? r.rules[0]! : r.rules;
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(expect.arrayContaining(["/admin", "/api/", "/checkout", "/account", "/search"]));
    expect(r.sitemap).toBe(`${BASE}/sitemap.xml`);
  });

  it("staging asks to be left alone completely", () => {
    const r = robotsFor(false, BASE);
    expect(r.rules).toEqual([{ userAgent: "*", disallow: "/" }]);
    expect(r.sitemap).toBeUndefined();
  });
});

describe("sitemap", () => {
  it("lists every public page with absolute addresses", () => {
    const map = sitemapFor(
      {
        products: [
          { slug: "chopper", updatedAt: "2026-11-20T00:00:00.000Z", image: "https://res.cloudinary.com/x/a.jpg" },
          { slug: "lamp", updatedAt: "2026-11-21T00:00:00.000Z", image: null },
        ],
        categories: ["kitchen"],
        collections: ["deals"],
        pages: [{ slug: "about", updatedAt: "2026-11-01T00:00:00.000Z" }],
      },
      BASE,
    );
    expect(map.map((e) => e.url)).toEqual([
      `${BASE}/`,
      `${BASE}/c/kitchen`,
      `${BASE}/collections/deals`,
      `${BASE}/p/chopper`,
      `${BASE}/p/lamp`,
      `${BASE}/pages/about`,
    ]);
    expect(map[0]!.lastModified).toBe("2026-11-21T00:00:00.000Z");
    expect(map[3]!.images).toEqual(["https://res.cloudinary.com/x/a.jpg"]);
    expect(map[4]!.images).toBeUndefined();
  });
});

describe("structured data and share previews", () => {
  it("describes the shop and its search", () => {
    const org = organizationJsonLd({
      name: "Shop",
      base: BASE,
      logo: "/logo.png",
      phone: "+8801712345678",
      email: "",
      sameAs: ["https://facebook.com/shop"],
    });
    expect(org).toMatchObject({
      "@type": "OnlineStore",
      url: `${BASE}/`,
      logo: `${BASE}/logo.png`,
      contactPoint: { telephone: "+8801712345678", areaServed: "BD" },
      sameAs: ["https://facebook.com/shop"],
    });
    expect(org.contactPoint).not.toHaveProperty("email");
    expect(websiteJsonLd("Shop", BASE).potentialAction.target.urlTemplate).toBe(
      `${BASE}/search?q={search_term_string}`,
    );
  });

  it("falls back to the shop's picture and keeps the site name", () => {
    const own = shareMeta({ siteName: "Shop", title: "Chopper", description: "d", path: "/p/c", image: "/a.jpg" });
    expect(own.openGraph).toMatchObject({ siteName: "Shop", url: "/p/c", images: [{ url: "/a.jpg" }] });
    const none = shareMeta({ siteName: "Shop", title: "About", description: "d", path: "/pages/about" });
    expect(none.openGraph.images[0]).toMatchObject({ url: DEFAULT_SHARE_IMAGE, width: 1200, height: 630 });
    expect(shareMeta({ siteName: "Shop", title: "Shop", description: "d" }).openGraph).not.toHaveProperty("url");
  });
});
