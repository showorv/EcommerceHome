import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  announcementLive,
  announcementNextChange,
  chatLinks,
  chatLive,
  chatSchema,
  cleanDesign,
  designProblem,
  contrast,
  DARK_TOKENS,
  defaultDesign,
  designSchema,
  isMega,
  LIGHT_TOKENS,
  textOn,
  themeContrast,
  themeCss,
  themeSchema,
} from "@/modules/storefront/design";

const NOW = Date.parse("2026-11-20T06:00:00Z");
const link = (label: string, href: string, i = 0) => ({ id: `lnk00${i}x`, label, href });

describe("navigation", () => {
  it("has working defaults and survives broken stored data", () => {
    expect(defaultDesign().navigation.header).toEqual([]);
    expect(defaultDesign().theme.brand).toBe("#e8742c");
    expect(cleanDesign({ navigation: { header: "nonsense" }, theme: { brand: "#123456" } }).theme.brand).toBe(
      "#123456",
    );
    expect(cleanDesign(null)).toEqual(defaultDesign());
  });

  it("refuses unsafe menu links and nameless links", () => {
    const bad = designSchema.safeParse({ navigation: { header: [{ ...link("Sale", "javascript:alert(1)") }] } });
    expect(bad.success).toBe(false);
    const nameless = designSchema.safeParse({ navigation: { header: [{ ...link("", "/c/kitchen") }] } });
    expect(nameless.success).toBe(false);
    const ok = designSchema.safeParse({ navigation: { header: [{ ...link("Kitchen", "/c/kitchen") }] } });
    expect(ok.success).toBe(true);
  });

  it("opens a mega-menu only when columns have links", () => {
    const plain = designSchema.parse({
      navigation: { header: [{ ...link("Shop", "/search"), children: [link("Kitchen", "/c/kitchen", 1)] }] },
    }).navigation.header[0]!;
    expect(isMega(plain)).toBe(false);
    const mega = designSchema.parse({
      navigation: {
        header: [
          {
            ...link("Shop", "/search"),
            children: [{ ...link("Kitchen", "/c/kitchen", 1), children: [link("Choppers", "/c/choppers", 2)] }],
          },
        ],
      },
    }).navigation.header[0]!;
    expect(isMega(mega)).toBe(true);
  });

  it("shows the announcement bar only when switched on, with a message, inside its dates", () => {
    const base = designSchema.parse({}).navigation.announcement;
    const on = { ...base, enabled: true, messages: [{ text: "Free delivery", href: "" }] };
    expect(announcementLive(base, NOW)).toBe(false);
    expect(announcementLive(on, NOW)).toBe(true);
    expect(announcementLive({ ...on, startAt: "2026-11-21T00:00:00.000Z" }, NOW)).toBe(false);
    expect(announcementLive({ ...on, endAt: "2026-11-20T06:00:00.000Z" }, NOW)).toBe(false);
    expect(announcementNextChange({ ...on, endAt: "2026-11-22T00:00:00.000Z" }, NOW)).toBe(
      Date.parse("2026-11-22T00:00:00Z"),
    );
    // Switched on without a message is a mistake the editor reports.
    expect(designSchema.safeParse({ navigation: { announcement: { enabled: true } } }).success).toBe(false);
  });
});

describe("theme", () => {
  it("measures colour contrast like WCAG", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
    expect(textOn("#ffffff")).toBe("#14161c");
    expect(textOn("#1d4ed8")).toBe("#ffffff");
  });

  it("warns when a pale brand colour would be hard to read as link text", () => {
    const yellow = themeContrast({ brand: "#ffe14d", accent: "#fff7d6", mode: "light" });
    expect(yellow.find((c) => c.label.startsWith("Brand-coloured links"))?.ok).toBe(false);
    expect(yellow.find((c) => c.label.startsWith("Button text"))?.ok).toBe(true); // dark text is picked
    const blue = themeContrast({ brand: "#1d4ed8", accent: "#dbeafe", mode: "light" });
    expect(blue.every((c) => c.ok)).toBe(true);
  });

  it("only accepts hex colours and listed options", () => {
    expect(themeSchema.safeParse({ brand: "red; } body { display:none" }).success).toBe(false);
    expect(themeSchema.safeParse({ bodyFont: "Comic Sans" }).success).toBe(false);
    expect(themeSchema.parse({ brand: "#ABCDEF" }).brand).toBe("#abcdef");
  });

  it("turns the theme into CSS variables, forcing light or dark when asked", () => {
    const t = themeSchema.parse({ brand: "#1d4ed8", radius: "large", bodyFont: "inter" });
    const css = themeCss(t);
    expect(css).toContain("--brand:#1d4ed8;");
    expect(css).toContain("--brand-foreground:#ffffff;");
    expect(css).toContain("--radius:1.125rem;");
    expect(css).toContain("--font-sans-latin:var(--ff-inter);");
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    const dark = themeCss({ ...t, mode: "dark" });
    expect(dark).toContain("color-scheme:dark");
    expect(dark).toContain(`--background:${DARK_TOKENS.background};`);
    expect(dark).not.toContain("@media");
  });

  it("keeps the forced light/dark colours in sync with globals.css", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const block = (start: string) => css.slice(css.indexOf(start), css.indexOf("}", css.indexOf(start)));
    const light = block(":root {");
    const dark = block(":root:not(.light) {");
    for (const [k, v] of Object.entries(LIGHT_TOKENS)) expect(light, k).toContain(`--${k}: ${v};`);
    for (const [k, v] of Object.entries(DARK_TOKENS)) expect(dark, k).toContain(`--${k}: ${v};`);
  });
});

describe("chat button (1.14)", () => {
  const chat = (c: Record<string, unknown>) => chatSchema.parse(c);

  it("is off by default and old designs get the default", () => {
    expect(defaultDesign().chat.enabled).toBe(false);
    expect(cleanDesign({ navigation: {}, theme: {} }).chat).toEqual(chatSchema.parse({}));
    expect(chatLive(chatSchema.parse({}))).toBe(false);
  });

  it("turns any way of typing a number into wa.me digits", () => {
    expect(chat({ whatsapp: "01712-345 678" }).whatsapp).toBe("8801712345678");
    expect(chat({ whatsapp: "+880 1712 345678" }).whatsapp).toBe("8801712345678");
    expect(chat({ whatsapp: "008801712345678" }).whatsapp).toBe("8801712345678");
    expect(chat({ whatsapp: "+44 7911 123456" }).whatsapp).toBe("447911123456");
    expect(chatSchema.safeParse({ whatsapp: "01212345678" }).success).toBe(false);
    expect(chatSchema.safeParse({ whatsapp: "call me" }).success).toBe(false);
  });

  it("takes a Facebook page as a username or a link", () => {
    for (const v of [
      "mystore.bd",
      "@mystore.bd",
      "https://www.facebook.com/mystore.bd/",
      "m.me/mystore.bd",
      "fb.com/mystore.bd?ref=x",
    ]) {
      expect(chat({ messenger: v }).messenger, v).toBe("mystore.bd");
    }
    expect(chatSchema.safeParse({ messenger: "my store" }).success).toBe(false);
    expect(chatSchema.safeParse({ messenger: "javascript:alert(1)" }).success).toBe(false);
  });

  it("needs somewhere to go when switched on", () => {
    expect(designProblem({ chat: { enabled: true } })).toMatch(/^Chat button: Add a WhatsApp number/);
    expect(designProblem({ chat: { enabled: true, messenger: "mystore.bd" } })).toBeNull();
  });

  it("builds the links, adding the page only when asked", () => {
    const c = chat({ enabled: true, whatsapp: "01712345678", messenger: "mystore.bd", greeting: "Hi & hello" });
    const l = chatLinks(c, "https://shop.example/p/chopper");
    expect(l.whatsapp).toBe(
      "https://wa.me/8801712345678?text=" + encodeURIComponent("Hi & hello\nhttps://shop.example/p/chopper"),
    );
    expect(l.messenger).toBe("https://m.me/mystore.bd");
    expect(chatLinks({ ...c, pageLink: false }, "https://x/p/y").whatsapp).toBe(
      "https://wa.me/8801712345678?text=" + encodeURIComponent("Hi & hello"),
    );
    expect(chatLinks({ ...c, greeting: "", pageLink: false }).whatsapp).toBe("https://wa.me/8801712345678");
  });
});
