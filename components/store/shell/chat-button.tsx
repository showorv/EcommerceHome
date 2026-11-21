"use client";

import { MessageCircle, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { chatLinks, type Chat } from "@/modules/storefront/design";
import { SocialIcon } from "./social-icons";

/**
 * Floating WhatsApp / Messenger button (FR-SF-10). One channel: the button opens it straight away. Both:
 * the button opens a small menu with the two. The WhatsApp message gets the current page's address at the
 * moment of the click, so the team sees which product the shopper means. On product pages it moves up
 * while the phone buy bar is showing (data-buy-bar in product-detail.tsx).
 */

const WHATSAPP = "#128c7e"; // WhatsApp's dark green: white on it passes the 3:1 contrast for icons
const MESSENGER = "#0866ff";

function MessengerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2C6.4 2 2 6.1 2 11.6c0 2.9 1.2 5.4 3.1 7.1v3.3l3-1.7c1.2.3 2.5.5 3.9.5 5.6 0 10-4.1 10-9.6S17.6 2 12 2zm1 12.9-2.6-2.7-5 2.7 5.5-5.8 2.6 2.7 4.9-2.7-5.4 5.8z" />
    </svg>
  );
}

/** Puts the page address into the WhatsApp message just before the browser follows the link. */
function withPage(chat: Chat) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    const href = chatLinks(chat, window.location.href).whatsapp;
    if (href) e.currentTarget.href = href;
  };
}

export function ChatButton({ chat }: { chat: Chat }) {
  const { whatsapp, messenger } = chatLinks(chat);
  const both = Boolean(whatsapp && messenger);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const label = chat.label || "Chat with us";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const fab =
    "flex h-14 min-w-14 items-center justify-center gap-2 rounded-full px-4 font-semibold text-white shadow-lg ring-1 ring-black/5 transition-[transform,box-shadow] hover:shadow-xl active:scale-95";

  return (
    <div
      ref={root}
      className={cn(
        "fixed bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 grid gap-3 transition-transform duration-300",
        chat.position === "left" ? "left-4 justify-items-start" : "right-4 justify-items-end",
        // Clear the phone buy bar on product pages.
        "max-md:[body:has([data-buy-bar=shown])_&]:-translate-y-20",
        "print:hidden",
      )}
    >
      {both && open && (
        <ul
          id="chat-options"
          className="bg-popover text-popover-foreground animate-in fade-in slide-in-from-bottom-2 grid w-60 gap-1 rounded-2xl border p-2 shadow-xl"
        >
          <li>
            <a
              href={whatsapp ?? undefined}
              onClick={withPage(chat)}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:bg-accent flex items-center gap-3 rounded-xl p-2 text-sm font-medium"
            >
              <span className="grid size-9 place-items-center rounded-full text-white" style={{ background: WHATSAPP }}>
                <SocialIcon network="whatsapp" className="size-5" />
              </span>
              WhatsApp
            </a>
          </li>
          <li>
            <a
              href={messenger ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:bg-accent flex items-center gap-3 rounded-xl p-2 text-sm font-medium"
            >
              <span
                className="grid size-9 place-items-center rounded-full text-white"
                style={{ background: MESSENGER }}
              >
                <MessengerIcon className="size-5" />
              </span>
              Messenger
            </a>
          </li>
        </ul>
      )}

      {both ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="chat-options"
          aria-label={open ? "Close chat options" : label}
          onClick={() => setOpen((o) => !o)}
          className={cn(fab, "bg-brand text-brand-foreground")}
        >
          {open ? <X className="size-6" aria-hidden /> : <MessageCircle className="size-6" aria-hidden />}
          {!open && <span className="hidden text-sm md:inline">{label}</span>}
        </button>
      ) : (
        <a
          href={whatsapp ?? messenger ?? undefined}
          onClick={whatsapp ? withPage(chat) : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${label} on ${whatsapp ? "WhatsApp" : "Messenger"}`}
          className={fab}
          style={{ background: whatsapp ? WHATSAPP : MESSENGER }}
        >
          {whatsapp ? <SocialIcon network="whatsapp" className="size-6" /> : <MessengerIcon className="size-6" />}
          <span className="hidden text-sm md:inline">{label}</span>
        </a>
      )}
    </div>
  );
}
