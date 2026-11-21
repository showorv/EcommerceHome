import { z } from "zod";
import { hrefField, imageField, whenField } from "./sections";

/**
 * Store design settings (FR-SF-02, FR-SF-03, FR-SF-04): header menu with mega-menus, footer,
 * announcement bar, social links and theme tokens. Pure and browser-safe: the admin editor and the
 * store share one definition. The theme is applied as CSS variables, so changes need no rebuild.
 */

const text = (max: number) => z.string().trim().max(max).default("");
const id = z.string().regex(/^[A-Za-z0-9_-]{6,24}$/, "Invalid id");

// ---------- Navigation ----------

const link = z.object({ id, label: text(40).refine(Boolean, "Every menu link needs a name"), href: hrefField });

/** Header menu: top items → columns → links. A top item whose columns have links opens a mega-menu. */
const menuColumn = link.extend({ children: z.array(link).max(12).default([]) });
const menuItem = link.extend({
  badge: text(12),
  children: z.array(menuColumn).max(6).default([]),
  /** Picture shown at the end of the mega-menu. */
  image: imageField,
});

export const SOCIAL_NETWORKS = ["facebook", "instagram", "youtube", "tiktok", "whatsapp"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];
export const SOCIAL_NAMES: Record<SocialNetwork, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
};

const footerColumn = z.object({
  id,
  heading: text(40),
  links: z.array(link).max(10).default([]),
});

export const navigationSchema = z.object({
  /** Empty = the store shows its top-level categories. */
  header: z.array(menuItem).max(8).default([]),
  footer: z
    .object({
      about: text(300),
      columns: z.array(footerColumn).max(4).default([]),
      phone: text(30),
      email: z.union([z.literal(""), z.email().max(254)]).default(""),
      address: text(200),
      social: z
        .array(z.object({ network: z.enum(SOCIAL_NETWORKS), url: hrefField }))
        .max(SOCIAL_NETWORKS.length)
        .default([]),
      bottomText: text(120),
    })
    .default({ about: "", columns: [], phone: "", email: "", address: "", social: [], bottomText: "" }),
  announcement: z
    .object({
      enabled: z.boolean().default(false),
      messages: z
        .array(z.object({ text: text(120).refine(Boolean, "Write the announcement"), href: hrefField }))
        .max(3)
        .default([]),
      style: z.enum(["brand", "dark", "accent"]).default("brand"),
      dismissible: z.boolean().default(true),
      startAt: whenField,
      endAt: whenField,
    })
    .refine((a) => !a.startAt || !a.endAt || a.startAt < a.endAt, {
      message: "The announcement must stop after it starts",
      path: ["endAt"],
    })
    .refine((a) => !a.enabled || a.messages.length > 0, {
      message: "Add a message or switch the announcement bar off",
      path: ["messages"],
    })
    .default({ enabled: false, messages: [], style: "brand", dismissible: true, startAt: null, endAt: null }),
});

export type Navigation = z.infer<typeof navigationSchema>;
export type MenuItem = Navigation["header"][number];
export type MenuLink = z.infer<typeof link>;

/** A top item opens a mega-menu when any column has links; plain dropdown when it only has columns. */
export const isMega = (item: MenuItem) => item.children.some((c) => c.children.length > 0);

// ---------- Chat button (FR-SF-10) ----------

/**
 * WhatsApp number as wa.me wants it: country code and number, digits only. A Bangladeshi mobile number
 * typed the local way (01712345678) gets 88 in front.
 */
const whatsappNumber = z
  .string()
  .trim()
  .max(24)
  .default("")
  .transform((v) =>
    v
      .replace(/[\s().-]/g, "")
      .replace(/^\+/, "")
      .replace(/^00/, ""),
  )
  .refine((v) => v === "" || /^\d{10,15}$/.test(v), "Type the WhatsApp number with digits only, like 01712345678")
  .refine(
    (v) => !v.startsWith("0") || /^01[3-9]\d{8}$/.test(v),
    "A Bangladeshi mobile number has 11 digits and starts with 013–019",
  )
  .transform((v) => (/^01[3-9]\d{8}$/.test(v) ? `88${v}` : v));

/** Facebook page for Messenger (m.me/<page>): the page's username or number, from a link or typed. */
const messengerPage = z
  .string()
  .trim()
  .max(200)
  .default("")
  .transform((v) =>
    v
      .replace(/^(https?:\/\/)?(www\.|m\.|web\.)?(facebook\.com|fb\.com|m\.me)\//i, "")
      .replace(/^@/, "")
      .replace(/[/?#].*$/, ""),
  )
  .refine(
    (v) => v === "" || /^[A-Za-z0-9.-]{3,80}$/.test(v),
    "Type your Facebook page’s username, like mystore.bd (the part after facebook.com/)",
  );

export const chatSchema = z
  .object({
    enabled: z.boolean().default(false),
    whatsapp: whatsappNumber,
    messenger: messengerPage,
    /** Typed into WhatsApp for the shopper, ready to send. */
    greeting: text(200).default("Hi! I have a question about your products."),
    /** Adds the page the shopper is on (e.g. the product) to the WhatsApp message. */
    pageLink: z.boolean().default(true),
    label: text(30).default("Chat with us"),
    position: z.enum(["right", "left"]).default("right"),
  })
  .refine((c) => !c.enabled || Boolean(c.whatsapp || c.messenger), {
    message: "Add a WhatsApp number or a Facebook page, or switch the chat button off",
    path: ["whatsapp"],
  });
export type Chat = z.infer<typeof chatSchema>;

/** Shown when the button is on and has somewhere to go. */
export const chatLive = (c: Chat) => c.enabled && Boolean(c.whatsapp || c.messenger);

/** Where each chat option goes. `pageUrl` is added to the WhatsApp message when pageLink is on. */
export function chatLinks(c: Chat, pageUrl?: string): { whatsapp: string | null; messenger: string | null } {
  let whatsapp: string | null = null;
  if (c.whatsapp) {
    const message = [c.greeting, c.pageLink ? pageUrl : ""].filter(Boolean).join("\n");
    whatsapp = `https://wa.me/${c.whatsapp}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
  }
  return { whatsapp, messenger: c.messenger ? `https://m.me/${encodeURIComponent(c.messenger)}` : null };
}

// ---------- Theme ----------

/** Fonts the store can use. Each is bundled at build time; the theme only picks one. */
export const FONTS = {
  jakarta: "Plus Jakarta Sans",
  inter: "Inter",
  poppins: "Poppins",
  dmSans: "DM Sans",
  manrope: "Manrope",
  nunito: "Nunito",
  outfit: "Outfit",
} as const;
export const BANGLA_FONTS = { hind: "Hind Siliguri", notoBengali: "Noto Sans Bengali" } as const;
export type FontId = keyof typeof FONTS;
export type BanglaFontId = keyof typeof BANGLA_FONTS;

export const RADII = { none: 0, small: 0.375, medium: 0.75, large: 1.125 } as const;

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-f]{6}$/i, "Use a colour like #e8742c")
  .transform((v) => v.toLowerCase());

export const themeSchema = z.object({
  brand: hex.default("#e8742c"),
  accent: hex.default("#fdebdc"),
  bodyFont: z.enum(Object.keys(FONTS) as [FontId, ...FontId[]]).default("jakarta"),
  headingFont: z.enum(Object.keys(FONTS) as [FontId, ...FontId[]]).default("jakarta"),
  banglaFont: z.enum(Object.keys(BANGLA_FONTS) as [BanglaFontId, ...BanglaFontId[]]).default("hind"),
  radius: z.enum(Object.keys(RADII) as [keyof typeof RADII, ...(keyof typeof RADII)[]]).default("medium"),
  /** "system" follows the shopper's phone or computer setting. */
  mode: z.enum(["system", "light", "dark"]).default("system"),
  motion: z.enum(["full", "reduced", "off"]).default("full"),
  logo: imageField,
  logoHeight: z.coerce.number().int().min(20).max(64).default(32),
  favicon: imageField,
});
export type Theme = z.infer<typeof themeSchema>;

export const designSchema = z.object({
  navigation: navigationSchema.default(navigationSchema.parse({})),
  theme: themeSchema.default(themeSchema.parse({})),
  chat: chatSchema.default(chatSchema.parse({})),
});
export type Design = z.infer<typeof designSchema>;

/** The first problem in a design, said where it is ("Footer: …"), or null when it is fine. */
export function designProblem(raw: unknown): string | null {
  const r = designSchema.safeParse(raw);
  if (r.success) return null;
  const issue = r.error.issues[0];
  const [top, part] = issue?.path ?? [];
  const where =
    top === "theme"
      ? "Theme"
      : top === "chat"
        ? "Chat button"
        : part === "footer"
          ? "Footer"
          : part === "announcement"
            ? "Announcement bar"
            : "Header menu";
  return `${where}: ${issue?.message ?? "check the settings"}`;
}

export const defaultDesign = (): Design => designSchema.parse({});

/** Stored design read back: anything that no longer validates falls back to the defaults. */
export function cleanDesign(raw: unknown): Design {
  const r = designSchema.safeParse(raw ?? {});
  if (r.success) return r.data;
  const nav = navigationSchema.safeParse((raw as { navigation?: unknown })?.navigation ?? {});
  const theme = themeSchema.safeParse((raw as { theme?: unknown })?.theme ?? {});
  const chat = chatSchema.safeParse((raw as { chat?: unknown })?.chat ?? {});
  return {
    navigation: nav.success ? nav.data : navigationSchema.parse({}),
    theme: theme.success ? theme.data : themeSchema.parse({}),
    chat: chat.success ? chat.data : chatSchema.parse({}),
  };
}

/** Is the announcement bar shown at `now`? */
export function announcementLive(a: Navigation["announcement"], now: number): boolean {
  if (!a.enabled || a.messages.length === 0) return false;
  if (a.startAt && Date.parse(a.startAt) > now) return false;
  if (a.endAt && Date.parse(a.endAt) <= now) return false;
  return true;
}

/** Next time the announcement starts or stops (ms), so the cached store refreshes then. */
export function announcementNextChange(a: Navigation["announcement"], now: number): number | null {
  if (!a.enabled) return null;
  const times = [a.startAt, a.endAt].map((t) => (t ? Date.parse(t) : NaN)).filter((t) => t > now);
  return times.length ? Math.min(...times) : null;
}

// ---------- Colour contrast (WCAG 2.1) ----------

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hexColour: string): number {
  const n = parseInt(hexColour.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black text, whichever reads better on `bg`. */
export function textOn(bg: string): string {
  return contrast(bg, "#ffffff") >= contrast(bg, "#14161c") ? "#ffffff" : "#14161c";
}

const LIGHT_BG = "#fdfcfa";
const DARK_BG = "#14161c";

export type ContrastCheck = { label: string; ratio: number; ok: boolean; hint: string };

/**
 * Checks shown when saving a theme (NFR: colour contrast checked on theme save). Buttons use the best
 * text colour automatically; the brand colour is also used for links and prices on the page background.
 */
export function themeContrast(t: Pick<Theme, "brand" | "accent" | "mode">): ContrastCheck[] {
  const r = (n: number) => Math.round(n * 100) / 100;
  const checks: ContrastCheck[] = [];
  const btn = contrast(t.brand, textOn(t.brand));
  checks.push({ label: "Button text on the brand colour", ratio: r(btn), ok: btn >= 4.5, hint: "needs 4.5" });
  if (t.mode !== "dark") {
    const v = contrast(t.brand, LIGHT_BG);
    checks.push({ label: "Brand-coloured links on a light page", ratio: r(v), ok: v >= 3, hint: "needs 3" });
  }
  if (t.mode !== "light") {
    const v = contrast(t.brand, DARK_BG);
    checks.push({ label: "Brand-coloured links on a dark page", ratio: r(v), ok: v >= 3, hint: "needs 3" });
  }
  const acc = contrast(t.accent, textOn(t.accent));
  checks.push({ label: "Text on the accent colour", ratio: r(acc), ok: acc >= 4.5, hint: "needs 4.5" });
  return checks;
}

// ---------- Theme → CSS ----------

/**
 * Light and dark colour tokens, copied from app/globals.css (a test keeps them in sync). Needed only
 * to force light or dark regardless of the shopper's setting.
 */
export const LIGHT_TOKENS: Record<string, string> = {
  background: "oklch(0.99 0.003 85)",
  foreground: "oklch(0.18 0.01 260)",
  card: "oklch(1 0 0)",
  "card-foreground": "oklch(0.18 0.01 260)",
  popover: "oklch(1 0 0)",
  "popover-foreground": "oklch(0.18 0.01 260)",
  primary: "oklch(0.22 0.02 260)",
  "primary-foreground": "oklch(0.99 0 0)",
  secondary: "oklch(0.96 0.006 85)",
  "secondary-foreground": "oklch(0.22 0.02 260)",
  muted: "oklch(0.96 0.006 85)",
  "muted-foreground": "oklch(0.5 0.015 260)",
  destructive: "oklch(0.577 0.245 27.325)",
  border: "oklch(0.91 0.006 85)",
  input: "oklch(0.91 0.006 85)",
};
export const DARK_TOKENS: Record<string, string> = {
  background: "oklch(0.15 0.008 260)",
  foreground: "oklch(0.97 0.003 85)",
  card: "oklch(0.19 0.01 260)",
  "card-foreground": "oklch(0.97 0.003 85)",
  popover: "oklch(0.19 0.01 260)",
  "popover-foreground": "oklch(0.97 0.003 85)",
  primary: "oklch(0.95 0.006 85)",
  "primary-foreground": "oklch(0.2 0.02 260)",
  secondary: "oklch(0.25 0.012 260)",
  "secondary-foreground": "oklch(0.97 0.003 85)",
  muted: "oklch(0.25 0.012 260)",
  "muted-foreground": "oklch(0.7 0.012 260)",
  destructive: "oklch(0.704 0.191 22.216)",
  border: "oklch(1 0 0 / 10%)",
  input: "oklch(1 0 0 / 15%)",
};

const decls = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([k, v]) => `--${k}:${v};`)
    .join("");

/**
 * CSS that applies a theme on top of the defaults in globals.css. The selectors are deliberately more
 * specific than `:root` / `:root:not(.light)` there, so the theme wins in both light and dark.
 * Only values from the validated theme go in (hex colours and fixed lists), never free text.
 */
export function themeCss(raw: Theme): string {
  const t = themeSchema.parse(raw);
  const brandFg = textOn(t.brand);
  const accentFg = textOn(t.accent);
  const common = {
    brand: t.brand,
    "brand-foreground": brandFg,
    ring: t.brand,
    "chart-1": t.brand,
    "sidebar-ring": t.brand,
    radius: `${RADII[t.radius]}rem`,
    "font-sans-latin": `var(--ff-${t.bodyFont})`,
    "font-heading": `var(--ff-${t.headingFont})`,
    "font-bangla": `var(--ff-${t.banglaFont})`,
  };
  const lightAccent = { accent: t.accent, "accent-foreground": accentFg };
  // On a dark page a pale accent would glare; use a deep tint of it instead.
  const darkAccent = {
    accent: `color-mix(in oklch, ${t.accent} 22%, ${DARK_TOKENS.background})`,
    "accent-foreground": `color-mix(in oklch, ${t.accent} 60%, white)`,
  };
  const S = "html:root:not(.theme-x)"; // beats :root:not(.light) from globals.css
  if (t.mode === "light") {
    return `${S}{color-scheme:light;${decls({ ...LIGHT_TOKENS, ...common, ...lightAccent })}}`;
  }
  if (t.mode === "dark") {
    return `${S}{color-scheme:dark;${decls({ ...DARK_TOKENS, ...common, ...darkAccent })}}`;
  }
  return (
    `${S}{${decls({ ...common, ...lightAccent })}}` + `@media (prefers-color-scheme: dark){${S}{${decls(darkAccent)}}}`
  );
}
