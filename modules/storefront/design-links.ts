import type { Chat, MenuItem } from "./design";

/**
 * Small helpers the storefront header and chat button run in the browser. Kept apart from design.ts,
 * whose zod schemas would otherwise be sent to every shopper's phone (NFR-PF-02).
 */

/** `/c/kitchen` → category "kitchen", `/collections/sale` → collection "sale"; anything else: null. */
export function previewSource(href: string): { kind: "category" | "collection"; slug: string } | null {
  const m = href.match(/^\/(c|collections)\/([a-z0-9-]+)\/?$/);
  if (!m) return null;
  return { kind: m[1] === "c" ? "category" : "collection", slug: m[2]! };
}

/** A menu item whose children have children of their own opens as a mega menu. */
export const isMega = (item: MenuItem) => item.children.some((c) => c.children.length > 0);

/** Where each chat option goes. `pageUrl` is added to the WhatsApp message when pageLink is on. */
export function chatLinks(c: Chat, pageUrl?: string): { whatsapp: string | null; messenger: string | null } {
  let whatsapp: string | null = null;
  if (c.whatsapp) {
    const message = [c.greeting, c.pageLink ? pageUrl : ""].filter(Boolean).join("\n");
    whatsapp = `https://wa.me/${c.whatsapp}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
  }
  return { whatsapp, messenger: c.messenger ? `https://m.me/${encodeURIComponent(c.messenger)}` : null };
}
