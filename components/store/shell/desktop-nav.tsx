"use client";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useMotionLevel } from "@/components/motion/motion-provider";
import { cn } from "@/lib/utils";
import type { MenuItem } from "@/modules/storefront/design";
import { isMega } from "@/modules/storefront/design-links";
import type { MenuPreview } from "@/modules/storefront/menu-preview";
import { MenuPreviewPanel } from "./menu-preview-panel";

/**
 * Header menu on tablets and computers (FR-SF-02). Items with columns open a dropdown, or a full-width
 * mega-menu when the columns have links. A category or collection link shows a product preview panel
 * (menu-preview-panel.tsx) and dims the page behind it. Opens on hover (with a short delay so passing
 * over doesn't flicker), on click / Enter, and closes on Escape, a click elsewhere, or navigating.
 */
export function DesktopNav({ items, previews = {} }: { items: MenuItem[]; previews?: Record<string, MenuPreview> }) {
  const [open, setOpen] = useState<string | null>(null);
  const level = useMotionLevel();
  const reduce = useReducedMotion() || level === "off";
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const baseId = useId();

  // Close when the page changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(null);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const btn = root.current?.querySelector<HTMLButtonElement>(`[data-menu="${open}"]`);
      setOpen(null);
      btn?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const later = (fn: () => void, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  };

  return (
    // Not positioned itself: a mega-menu spans the header row it sits in.
    <div ref={root} onPointerLeave={() => later(() => setOpen(null), 150)}>
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const preview = previews[item.id];
          const hasMenu = !preview && item.children.length > 0;
          const panelId = `${baseId}-${item.id}`;
          const isOpen = open === item.id;
          return (
            <li key={item.id} className={cn(!isMega(item) && !preview && "relative")}>
              {preview ? (
                <Link
                  href={item.href || "/"}
                  data-menu={item.id}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onPointerEnter={(e) => e.pointerType === "mouse" && later(() => setOpen(item.id), open ? 0 : 120)}
                  onFocus={() => later(() => setOpen(item.id), 0)}
                  onClick={() => setOpen(null)}
                  className={cn(
                    "relative flex h-10 items-center gap-1 rounded-full px-3 text-sm font-medium transition-colors",
                    isOpen ? "bg-foreground text-background" : "hover:bg-accent",
                  )}
                >
                  {item.label}
                  {item.badge && <Badge text={item.badge} />}
                </Link>
              ) : hasMenu ? (
                <button
                  type="button"
                  data-menu={item.id}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpen(isOpen ? null : item.id)}
                  onPointerEnter={(e) => e.pointerType === "mouse" && later(() => setOpen(item.id), open ? 0 : 120)}
                  className={cn(
                    "hover:bg-accent flex h-10 items-center gap-1 rounded-full px-3 text-sm font-medium transition-colors",
                    isOpen && "bg-accent",
                  )}
                >
                  {item.label}
                  {item.badge && <Badge text={item.badge} />}
                  <ChevronDown className={cn("size-3.5 transition-transform", isOpen && "rotate-180")} aria-hidden />
                </button>
              ) : (
                <Link
                  href={item.href || "/"}
                  onPointerEnter={() => later(() => setOpen(null), 120)}
                  className="hover:bg-accent flex h-10 items-center gap-1 rounded-full px-3 text-sm font-medium transition-colors"
                >
                  {item.label}
                  {item.badge && <Badge text={item.badge} />}
                </Link>
              )}
              {hasMenu && (
                <div
                  id={panelId}
                  hidden={!isOpen}
                  onPointerEnter={() => later(() => setOpen(item.id), 0)}
                  className={cn(
                    "bg-popover text-popover-foreground z-50 rounded-2xl border shadow-xl",
                    isMega(item) ? "absolute inset-x-0 top-full mt-2 p-6" : "absolute top-full left-0 mt-2 w-60 p-2",
                  )}
                >
                  {isMega(item) ? <MegaPanel item={item} /> : <DropdownPanel item={item} />}
                </div>
              )}
              {/* Only drawn while open, so its photos load on first hover rather than with every page. */}
              <AnimatePresence>
                {preview && isOpen && (
                  <motion.div
                    id={panelId}
                    key={item.id}
                    onPointerEnter={() => later(() => setOpen(item.id), 0)}
                    initial={reduce ? false : { opacity: 0, y: -10, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={
                      reduce
                        ? { opacity: 0, transition: { duration: 0 } }
                        : { opacity: 0, y: -6, transition: { duration: 0.15 } }
                    }
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="bg-popover text-popover-foreground absolute inset-x-0 top-full z-50 mt-1 origin-top rounded-3xl border p-7 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.25)]"
                  >
                    <MenuPreviewPanel
                      label={item.label}
                      href={item.href}
                      preview={preview}
                      onNavigate={() => setOpen(null)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      <Backdrop show={open !== null && Boolean(previews[open])} reduce={reduce} />
    </div>
  );
}

/** Dims the page under the header while a product preview is open. */
const noop = () => () => {};

function Backdrop({ show, reduce }: { show: boolean; reduce: boolean }) {
  // Portals need the page, which the server render doesn't have.
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-30 bg-black/25 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.25 }}
        />
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span className="bg-brand text-brand-foreground rounded-full px-1.5 py-px text-[10px] font-bold tracking-wide uppercase">
      {text}
    </span>
  );
}

function DropdownPanel({ item }: { item: MenuItem }) {
  return (
    <ul className="grid gap-0.5">
      {item.children.map((c) => (
        <li key={c.id}>
          <Link href={c.href || "/"} className="hover:bg-accent block rounded-lg px-3 py-2 text-sm">
            {c.label}
          </Link>
        </li>
      ))}
      {item.href && (
        <li className="mt-1 border-t pt-1">
          <Link
            href={item.href}
            className="text-brand hover:bg-accent block rounded-lg px-3 py-2 text-sm font-semibold"
          >
            All {item.label.toLowerCase()}
          </Link>
        </li>
      )}
    </ul>
  );
}

function MegaPanel({ item }: { item: MenuItem }) {
  const image = item.image.url ? item.image : null;
  return (
    <div className={cn("grid gap-8", image ? "grid-cols-[1fr_16rem]" : "grid-cols-1")}>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-8 gap-y-6">
        {item.children.map((col) => (
          <div key={col.id} className="grid content-start gap-2">
            {col.href ? (
              <Link href={col.href} className="text-sm font-semibold hover:underline">
                {col.label}
              </Link>
            ) : (
              <p className="text-sm font-semibold">{col.label}</p>
            )}
            <ul className="grid gap-1.5">
              {col.children.map((l) => (
                <li key={l.id}>
                  <Link href={l.href || "/"} className="text-muted-foreground hover:text-foreground text-sm">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {image && (
        <Link
          href={item.href || "/"}
          className="group bg-muted relative block aspect-[4/5] overflow-hidden rounded-xl"
          aria-label={image.alt || item.label}
        >
          <Image
            src={image.url}
            alt={image.alt}
            fill
            sizes="256px"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </Link>
      )}
      {item.href && (
        <Link href={item.href} className="text-brand w-fit text-sm font-semibold hover:underline">
          Shop all {item.label.toLowerCase()} →
        </Link>
      )}
    </div>
  );
}
