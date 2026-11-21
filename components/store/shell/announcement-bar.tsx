"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useOnScreen } from "@/components/motion/use-on-screen";
import { cn } from "@/lib/utils";
import type { Navigation } from "@/modules/storefront/design";

/**
 * Announcement bar (FR-SF-02). Several messages take turns every 5 seconds (paused on hover or
 * focus, and while scrolled out of view). A closed bar stays closed until its text changes.
 */

const STYLES = {
  brand: "bg-brand text-brand-foreground",
  dark: "bg-neutral-900 text-white",
  accent: "bg-accent text-accent-foreground",
} as const;

function keyOf(messages: Navigation["announcement"]["messages"]) {
  let h = 0;
  for (const ch of JSON.stringify(messages)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `announcement-closed:${h}`;
}

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

export function AnnouncementBar({ announcement }: { announcement: Navigation["announcement"] }) {
  const { messages, style, dismissible } = announcement;
  const storageKey = keyOf(messages);
  const [closedNow, setClosedNow] = useState(false);
  const closedBefore = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(storageKey) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(root);

  useEffect(() => {
    if (messages.length < 2 || paused || !onScreen) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % messages.length), 5000);
    return () => clearInterval(t);
  }, [messages.length, paused, onScreen]);

  if (closedNow || (dismissible && closedBefore) || messages.length === 0) return null;

  return (
    <div
      ref={root}
      role="region"
      aria-label="Announcement"
      className={cn("relative text-center text-sm font-medium", STYLES[style])}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="mx-auto grid max-w-6xl px-10 py-2">
        {messages.map((m, i) => (
          <p
            key={i}
            aria-hidden={i !== index}
            className={cn(
              "col-start-1 row-start-1 truncate transition-opacity duration-500",
              i === index ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            {m.href ? (
              <Link
                href={m.href}
                tabIndex={i === index ? undefined : -1}
                className="underline-offset-4 hover:underline"
              >
                {m.text}
              </Link>
            ) : (
              m.text
            )}
          </p>
        ))}
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={() => {
            setClosedNow(true);
            try {
              localStorage.setItem(storageKey, "1");
            } catch {
              // private mode: closes for this visit only
            }
          }}
          className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full opacity-80 hover:opacity-100"
          aria-label="Close announcement"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
