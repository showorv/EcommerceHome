import type { Chat, MenuItem } from "./design";

/**
 * Small helpers the storefront header and chat button run in the browser. Kept apart from design.ts,
 * whose zod schemas would otherwise be sent to every shopper's phone (NFR-PF-02).
 */

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
