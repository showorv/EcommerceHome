"use client";

import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useMotionLevel } from "@/components/motion/motion-provider";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { MenuPreview, PreviewCard } from "@/modules/storefront/menu-preview";

const EASE = [0.22, 1, 0.36, 1] as const;

const grid: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
  gone: { transition: { staggerChildren: 0.03, staggerDirection: -1 } },
};
const card: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  shown: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE } },
  gone: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

/**
 * The header's product preview (shown on hover): sub-categories on the left, their products on the
 * right. Pointing at a sub-category swaps the products; the highlight glides between them.
 */
export function MenuPreviewPanel({
  label,
  href,
  preview,
  onNavigate,
}: {
  label: string;
  href: string;
  preview: MenuPreview;
  onNavigate: () => void;
}) {
  const level = useMotionLevel();
  const reduce = useReducedMotion() || level === "off";
  const [active, setActive] = useState(href);
  const products = preview.products[active]?.length ? preview.products[active]! : (preview.products[href] ?? []);
  const activeLabel = preview.links.find((l) => l.href === active)?.label ?? label;

  return (
    <div className="grid grid-cols-[15rem_minmax(0,1fr)] gap-8">
      <div className="flex min-h-full flex-col">
        <p className="text-muted-foreground mb-3 text-xs font-semibold tracking-[0.18em] uppercase">{label}</p>
        <ul className="grid gap-0.5" onPointerLeave={() => setActive(href)}>
          {preview.links.map((l) => {
            const on = active === l.href;
            return (
              <li key={l.href} className="relative">
                {on && (
                  <motion.span
                    layoutId={`menu-pill-${href}`}
                    className="bg-muted absolute inset-0 rounded-xl"
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <Link
                  href={l.href}
                  onPointerEnter={() => setActive(l.href)}
                  onFocus={() => setActive(l.href)}
                  onClick={onNavigate}
                  className={cn(
                    "relative flex items-center justify-between rounded-xl px-3 py-2.5 text-lg leading-tight font-semibold tracking-tight transition-colors",
                    on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l.label}
                  <ArrowRight
                    className={cn(
                      "size-4 transition-[opacity,transform]",
                      on ? "opacity-100" : "-translate-x-1 opacity-0",
                    )}
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
        <Link
          href={href}
          onClick={onNavigate}
          className="group/all mt-auto flex items-center justify-between border-t pt-4 text-sm font-semibold"
        >
          View all {label.toLowerCase()}
          <ArrowRight className="size-4 transition-transform group-hover/all:translate-x-1" aria-hidden />
        </Link>
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-sm font-semibold">{activeLabel}</p>
          {active !== href && (
            <Link href={active} onClick={onNavigate} className="text-brand text-xs font-semibold hover:underline">
              Shop {activeLabel.toLowerCase()}
            </Link>
          )}
        </div>
        <AnimatePresence mode="wait" initial={!reduce}>
          <motion.ul
            key={active}
            className="grid grid-cols-4 gap-4"
            variants={reduce ? undefined : grid}
            initial="hidden"
            animate="shown"
            exit="gone"
          >
            {products.map((p) => (
              <motion.li key={p.id} variants={reduce ? undefined : card}>
                <PreviewCardView product={p} onNavigate={onNavigate} />
              </motion.li>
            ))}
          </motion.ul>
        </AnimatePresence>
      </div>
    </div>
  );
}

function PreviewCardView({ product: p, onNavigate }: { product: PreviewCard; onNavigate: () => void }) {
  return (
    <Link
      href={`/p/${p.slug}`}
      onClick={onNavigate}
      className="group/pc bg-card block overflow-hidden rounded-2xl border transition-shadow duration-300 hover:shadow-[0_14px_30px_-12px_rgb(0_0_0/0.22)]"
    >
      <div className="bg-muted relative aspect-square overflow-hidden">
        {p.image && (
          <Image
            src={p.image.url}
            alt={p.image.alt || p.title}
            fill
            sizes="220px"
            className={cn(
              "object-cover transition-[opacity,transform] duration-500 group-hover/pc:scale-105",
              p.hoverImage && "group-hover/pc:opacity-0",
            )}
            style={{
              objectPosition: `${p.image.focalX}% ${p.image.focalY}%`,
              ...(p.image.blur ? { backgroundImage: `url(${p.image.blur})`, backgroundSize: "cover" } : {}),
            }}
          />
        )}
        {p.hoverImage && (
          <Image
            src={p.hoverImage}
            alt=""
            fill
            sizes="220px"
            loading="lazy"
            className="object-cover opacity-0 transition-[opacity,transform] duration-500 group-hover/pc:scale-105 group-hover/pc:opacity-100"
          />
        )}
        {p.discount > 0 && (
          <span className="absolute top-2 left-2 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
            −{p.discount}%
          </span>
        )}
      </div>
      <div className="flex items-start justify-between gap-2 p-3">
        <p className="line-clamp-2 text-sm leading-snug font-medium">{p.title}</p>
        <p className="shrink-0 text-right text-sm leading-snug font-bold tabular-nums">
          {p.priceMax > p.price && <span className="text-muted-foreground block text-[10px] font-normal">From</span>}
          {formatTaka(p.price)}
          {p.compareAt > 0 && (
            <span className="text-muted-foreground block text-xs font-normal line-through">
              {formatTaka(p.compareAt)}
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}
