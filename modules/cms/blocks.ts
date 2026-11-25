import { z } from "zod";
import { SLUG_RE } from "@/modules/catalog/logic";
import { hrefField, imageField, isSafeHref, newSectionId } from "@/modules/storefront/sections";

/**
 * CMS pages (FR-SF-09): About, policies, FAQ, Contact and any custom page, built from blocks in the
 * admin. Content is stored as JSON blocks and rendered by our own components (SRS: "editor storing
 * JSON, rendered by our own components"); text is plain text with a tiny safe formatting syntax
 * (**bold**, *italic*, [link](/path)), never HTML. Pure and browser-safe.
 */

const text = (max: number) => z.string().trim().max(max).default("");
const id = z.string().regex(/^[A-Za-z0-9_-]{6,24}$/, "Invalid id");

export const BLOCK_TYPES = [
  "heading",
  "paragraph",
  "list",
  "image",
  "callout",
  "faq",
  "button",
  "divider",
  "contactDetails",
  "contactForm",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_INFO: Record<BlockType, { name: string; description: string }> = {
  heading: { name: "Heading", description: "A section title" },
  paragraph: { name: "Paragraph", description: "Text with **bold**, *italic* and [links](/path)" },
  list: { name: "List", description: "Bullet points or numbered steps" },
  image: { name: "Image", description: "A picture with an optional caption" },
  callout: { name: "Notice", description: "A highlighted box for important information" },
  faq: { name: "Questions & answers", description: "Expandable questions (Google sees them as an FAQ)" },
  button: { name: "Button", description: "A link that looks like a button" },
  divider: { name: "Divider", description: "A thin line between parts" },
  contactDetails: { name: "Contact details", description: "Phone, email, address and social links from Menus & theme" },
  contactForm: { name: "Contact form", description: "Shoppers send you a message (saved in the admin)" },
};

const BLOCK_DATA = {
  heading: z.object({ text: text(160).refine(Boolean, "Write the heading"), level: z.enum(["2", "3"]).default("2") }),
  paragraph: z.object({ text: text(5000).refine(Boolean, "Write the paragraph or remove it") }),
  list: z.object({
    style: z.enum(["bullet", "number"]).default("bullet"),
    items: z.array(text(600)).min(1, "Add at least one point").max(50),
  }),
  image: z.object({
    image: imageField.refine((i) => i.url !== "", "Upload the image"),
    caption: text(200),
    width: z.enum(["normal", "wide"]).default("normal"),
  }),
  callout: z.object({
    tone: z.enum(["info", "warning", "success"]).default("info"),
    text: text(1000).refine(Boolean, "Write the notice"),
  }),
  faq: z.object({
    items: z
      .array(z.object({ q: text(200).refine(Boolean, "Write the question"), a: text(2000) }))
      .min(1)
      .max(40),
  }),
  button: z.object({
    label: text(40).refine(Boolean, "Write the button text"),
    href: hrefField.refine(Boolean, "Add the button link"),
    style: z.enum(["solid", "outline"]).default("solid"),
  }),
  divider: z.object({}),
  contactDetails: z.object({ heading: text(80) }),
  contactForm: z.object({ heading: text(80), text: text(300) }),
} satisfies Record<BlockType, z.ZodType>;

export type BlockData<T extends BlockType> = z.infer<(typeof BLOCK_DATA)[T]>;

const blockOf = <T extends BlockType>(t: T) =>
  z.object({ id, type: z.literal(t), data: BLOCK_DATA[t] as (typeof BLOCK_DATA)[T] });

export const blockInput = z.discriminatedUnion("type", [
  blockOf("heading"),
  blockOf("paragraph"),
  blockOf("list"),
  blockOf("image"),
  blockOf("callout"),
  blockOf("faq"),
  blockOf("button"),
  blockOf("divider"),
  blockOf("contactDetails"),
  blockOf("contactForm"),
]);

export type Block = { [T in BlockType]: { id: string; type: T; data: BlockData<T> } }[BlockType];
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

export const MAX_BLOCKS = 100;

export const blocksInput = z
  .array(z.unknown())
  .max(MAX_BLOCKS, `A page can have up to ${MAX_BLOCKS} blocks`)
  .transform((list, ctx) => {
    const out: Block[] = [];
    list.forEach((raw, i) => {
      const r = blockInput.safeParse(raw);
      if (r.success) out.push(r.data as Block);
      else {
        const name = BLOCK_INFO[(raw as { type?: BlockType })?.type ?? "paragraph"]?.name ?? "Block";
        ctx.addIssue({
          code: "custom",
          message: `${name} (block ${i + 1}): ${r.error.issues[0]?.message ?? "invalid"}`,
        });
      }
    });
    if (new Set(out.map((b) => b.id)).size !== out.length)
      ctx.addIssue({ code: "custom", message: "Two blocks have the same id" });
    if (out.filter((b) => b.type === "contactForm").length > 1) {
      ctx.addIssue({ code: "custom", message: "A page can have only one contact form" });
    }
    return out;
  });

export function cleanBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((b) => {
    const r = blockInput.safeParse(b);
    return r.success ? [r.data as Block] : [];
  });
}

/** Page addresses: /pages/<slug>. */
export const pageSlug = z
  .string()
  .trim()
  .toLowerCase()
  .max(60)
  .regex(SLUG_RE, "Use lowercase letters, numbers and dashes, like return-policy");

/** Everything the editor saves for one page. */
export const cmsContentInput = z.object({
  title: text(120).refine(Boolean, "Give the page a title"),
  slug: pageSlug,
  seoTitle: text(70),
  seoDescription: text(170),
  blocks: blocksInput,
});
export type CmsContent = z.infer<typeof cmsContentInput>;

export function cleanContent(raw: unknown): CmsContent {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    title: String(r.title ?? "").slice(0, 120),
    slug: String(r.slug ?? ""),
    seoTitle: String(r.seoTitle ?? "").slice(0, 70),
    seoDescription: String(r.seoDescription ?? "").slice(0, 170),
    blocks: cleanBlocks(r.blocks),
  };
}

// ---------- New blocks ----------

const DEFAULT_DATA: { [T in BlockType]: () => BlockData<T> } = {
  heading: () => ({ text: "", level: "2" }),
  paragraph: () => ({ text: "" }),
  list: () => ({ style: "bullet", items: [""] }),
  image: () => ({ image: { url: "", alt: "" }, caption: "", width: "normal" }),
  callout: () => ({ tone: "info", text: "" }),
  faq: () => ({ items: [{ q: "", a: "" }] }),
  button: () => ({ label: "", href: "", style: "solid" }),
  divider: () => ({}),
  contactDetails: () => ({ heading: "Get in touch" }),
  contactForm: () => ({ heading: "Send us a message", text: "We usually reply within a day." }),
};

export function newBlock<T extends BlockType>(type: T, data?: Partial<BlockData<T>>): BlockOf<T> {
  return { id: newSectionId(), type, data: { ...DEFAULT_DATA[type](), ...data } } as unknown as BlockOf<T>;
}

// ---------- Inline formatting ----------

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "link"; text: string; href: string };

// Like Markdown, formatted words can't start or end with a space, so "2 * 3 * 4" stays as typed.
const INLINE_RE = /\*\*([^\s*](?:[^*\n]*?[^\s*])?)\*\*|\*([^\s*](?:[^*\n]*?[^\s*])?)\*|\[([^\]\n]+?)\]\(([^)\s]+?)\)/g;

/**
 * Splits text into plain, **bold**, *italic* and [link](href) pieces. Links that aren't store links,
 * https links, tel: or mailto: are shown as plain text. The result is rendered as React elements, so
 * nothing in the text can become HTML.
 */
export function parseInline(input: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const push = (piece: Inline) => {
    const prev = out[out.length - 1];
    if (piece.kind === "text" && prev?.kind === "text") prev.text += piece.text;
    else if (piece.kind !== "text" || piece.text) out.push(piece);
  };
  for (const m of input.matchAll(INLINE_RE)) {
    push({ kind: "text", text: input.slice(last, m.index) });
    if (m[1] !== undefined) push({ kind: "bold", text: m[1] });
    else if (m[2] !== undefined) push({ kind: "italic", text: m[2] });
    else {
      const href = m[4]!;
      const ok = isSafeHref(href) || /^mailto:[^\s@]+@[^\s@]+$/.test(href);
      push(ok ? { kind: "link", text: m[3]!, href } : { kind: "text", text: m[3]! });
    }
    last = m.index + m[0].length;
  }
  push({ kind: "text", text: input.slice(last) });
  return out;
}

/** Plain text for search snippets and meta descriptions. */
export function plainText(blocks: Block[], max = 160): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "paragraph" || b.type === "callout") parts.push(b.data.text);
    if (b.type === "list") parts.push(b.data.items.join(". "));
    if (parts.join(" ").length > max * 2) break;
  }
  const flat = parts
    .map((t) =>
      parseInline(t)
        .map((p) => p.text)
        .join(""),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

// ---------- Contact messages ----------

export const contactInput = z
  .object({
    name: z.string().trim().min(2, "Please enter your name").max(80),
    phone: z
      .string()
      .trim()
      .max(20)
      .refine(
        (p) => p === "" || /^(?:\+?88)?01[3-9]\d{8}$/.test(p.replace(/[\s-]/g, "")),
        "Enter a Bangladeshi mobile number, like 01712345678",
      ),
    email: z.union([z.literal(""), z.email("Enter a valid email address").max(254)]),
    message: z.string().trim().min(10, "Please write a little more (at least 10 characters)").max(2000),
  })
  .refine((c) => c.phone !== "" || c.email !== "", {
    message: "Add a phone number or an email so we can reply",
    path: ["phone"],
  });
export type ContactInput = z.infer<typeof contactInput>;
