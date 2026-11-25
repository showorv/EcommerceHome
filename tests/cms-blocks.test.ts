import { describe, expect, it } from "vitest";
import {
  BLOCK_TYPES,
  blocksInput,
  cleanContent,
  cmsContentInput,
  contactInput,
  newBlock,
  pageSlug,
  parseInline,
  plainText,
} from "@/modules/cms/blocks";
import { STANDARD_SLUGS, standardPages } from "@/modules/cms/templates";

describe("parseInline", () => {
  it("splits bold, italic and links, keeping the rest as text", () => {
    expect(parseInline("Pay **cash** on *delivery*, see [returns](/pages/returns).")).toEqual([
      { kind: "text", text: "Pay " },
      { kind: "bold", text: "cash" },
      { kind: "text", text: " on " },
      { kind: "italic", text: "delivery" },
      { kind: "text", text: ", see " },
      { kind: "link", text: "returns", href: "/pages/returns" },
      { kind: "text", text: "." },
    ]);
  });

  it("allows store, https, tel and mailto links only", () => {
    expect(parseInline("[a](https://example.com/x)")[0]).toMatchObject({ kind: "link" });
    expect(parseInline("[call](tel:+8801712345678)")[0]).toMatchObject({ kind: "link" });
    expect(parseInline("[mail](mailto:help@example.com)")[0]).toMatchObject({ kind: "link" });
    for (const bad of ["javascript:alert`1`", "//evil.com", "http://plain.com", "data:text/html,x"]) {
      expect(parseInline(`[x](${bad})`)).toEqual([{ kind: "text", text: "x" }]);
    }
  });

  it("leaves HTML and unmatched markers as plain text", () => {
    expect(parseInline("<b>hi</b> 2 * 3 **open")).toEqual([{ kind: "text", text: "<b>hi</b> 2 * 3 **open" }]);
    expect(parseInline("")).toEqual([]);
  });
});

describe("blocks", () => {
  it("every block type has a starter that validates once filled in", () => {
    for (const t of BLOCK_TYPES) expect(newBlock(t).type).toBe(t);
    const filled = [
      newBlock("heading", { text: "Hi" }),
      newBlock("paragraph", { text: "Body" }),
      newBlock("list", { items: ["one"] }),
      newBlock("callout", { text: "Note" }),
      newBlock("faq", { items: [{ q: "Q?", a: "A" }] }),
      newBlock("button", { label: "Go", href: "/search" }),
      newBlock("divider"),
      newBlock("contactDetails"),
      newBlock("contactForm"),
    ];
    expect(blocksInput.safeParse(filled).success).toBe(true);
  });

  it("explains which block is wrong", () => {
    const r = blocksInput.safeParse([
      newBlock("paragraph", { text: "ok" }),
      newBlock("button", { label: "Go", href: "javascript:x" }),
    ]);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/^Button \(block 2\)/);
  });

  it("allows one contact form per page and unique ids", () => {
    expect(blocksInput.safeParse([newBlock("contactForm"), newBlock("contactForm")]).success).toBe(false);
    const p = newBlock("paragraph", { text: "x" });
    expect(blocksInput.safeParse([p, p]).success).toBe(false);
  });

  it("rejects images from other websites", () => {
    const img = newBlock("image", { image: { url: "https://evil.example/x.jpg", alt: "" } });
    expect(blocksInput.safeParse([img]).success).toBe(false);
  });

  it("cleanContent drops broken blocks and keeps a stable shape", () => {
    const c = cleanContent({ title: "T", slug: "t", blocks: [{ id: "bad" }, newBlock("divider")], extra: 1 });
    expect(Object.keys(c)).toEqual(["title", "slug", "seoTitle", "seoDescription", "blocks"]);
    expect(c.blocks).toHaveLength(1);
  });

  it("plainText makes a short description from text blocks", () => {
    const text = plainText([
      newBlock("heading", { text: "Skip me" }),
      newBlock("paragraph", { text: "We **deliver** fast." }),
    ]);
    expect(text).toBe("We deliver fast.");
    expect(plainText([newBlock("paragraph", { text: "a ".repeat(200) })], 20)).toHaveLength(20);
  });
});

describe("page content", () => {
  it("checks addresses", () => {
    expect(pageSlug.parse(" Return-Policy ")).toBe("return-policy");
    for (const bad of ["", "a b", "-x", "x--y", "pages/x", "../x"]) expect(pageSlug.safeParse(bad).success).toBe(false);
  });

  it("standard pages are valid, unique and cover FR-SF-09", () => {
    const pages = standardPages("Test Store");
    expect(pages.map((p) => p.slug)).toEqual([...STANDARD_SLUGS]);
    for (const p of pages) {
      const r = cmsContentInput.safeParse(p);
      expect(r.success, `${p.slug}: ${r.error?.issues[0]?.message}`).toBe(true);
    }
    expect(JSON.stringify(pages.find((p) => p.slug === "returns"))).toContain("3 days");
    expect(pages.find((p) => p.slug === "contact")!.blocks.some((b) => b.type === "contactForm")).toBe(true);
  });
});

describe("contact form", () => {
  const ok = { name: "Rahim", phone: "01712-345678", email: "", message: "Is the chopper in stock?" };
  it("needs a phone or an email to reply to", () => {
    expect(contactInput.safeParse(ok).success).toBe(true);
    expect(contactInput.safeParse({ ...ok, phone: "", email: "r@example.com" }).success).toBe(true);
    const none = contactInput.safeParse({ ...ok, phone: "" });
    expect(none.error?.issues[0]?.path).toEqual(["phone"]);
  });
  it("checks Bangladeshi numbers, emails and message length", () => {
    expect(contactInput.safeParse({ ...ok, phone: "+8801712345678" }).success).toBe(true);
    expect(contactInput.safeParse({ ...ok, phone: "12345" }).success).toBe(false);
    expect(contactInput.safeParse({ ...ok, email: "nope" }).success).toBe(false);
    expect(contactInput.safeParse({ ...ok, message: "hi" }).success).toBe(false);
  });
});
