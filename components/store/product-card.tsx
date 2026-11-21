"use client";

import { Eye, ShoppingBag, Star } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { SPRING } from "@/components/motion/primitives";
import { useMotionLevel } from "@/components/motion/motion-provider";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CardMedia, CardProduct } from "@/modules/catalog/storefront";
import { addToCart, useCartAdding } from "./cart/cart-store";
import { LABELS, LOUD_LABELS } from "./labels";
import { prefetchQuickView, useOpenQuickView } from "./quick-view";

/**
 * Storefront product card (FR-PC-01…03, 05, 07).
 * - Desktop: hovering cross-fades to the admin-chosen second image (or plays a muted video), the card
 *   lifts on a spring and an action bar slides up. Keyboard focus shows the same bar.
 * - Touch: swipe left/right over the image to see more photos; dots show where you are.
 * - Fixed square frame + blur placeholder, so nothing jumps while images load.
 */

const SIZES = "(min-width: 1280px) 280px, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw";

const lift: Variants = { rest: { y: 0, scale: 1 }, active: { y: -6, scale: 1.02 } };
const bar: Variants = { rest: { y: "110%", opacity: 0 }, active: { y: 0, opacity: 1 } };

export function ProductCard({ product, eager = false }: { product: CardProduct; eager?: boolean }) {
  const level = useMotionLevel();
  const reduce = useReducedMotion();
  const canLift = level === "full" && !reduce;

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [index, setIndex] = useState(0); // touch swipe position
  const [swiped, setSwiped] = useState(false); // load photos 3+ only after the first swipe
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchX = useRef<number | null>(null);

  const { media } = product;
  const hoverMedia = media[1];
  const active = hovered || focused;
  const href = `/p/${product.slug}`;
  const openQuickView = useOpenQuickView();

  // Plain click opens the popup; Ctrl/Cmd/middle-click still opens the product page in a new tab.
  function quickView(e: MouseEvent) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openQuickView(product.slug);
  }
  const prefetch = () => prefetchQuickView(product.slug);
  const title = product.title.en;
  // One option and in stock: the card adds it straight to the cart. Otherwise quick view picks options.
  const oneClick = product.inStock && product.variantCount === 1;
  const adding = useCartAdding();

  function onEnter(e: PointerEvent) {
    if (e.pointerType !== "mouse") return;
    setHovered(true);
    if (hoverMedia?.autoplay) void videoRef.current?.play().catch(() => {});
  }
  function onLeave(e: PointerEvent) {
    if (e.pointerType !== "mouse") return;
    setHovered(false);
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
  }
  function onTouchDown(e: PointerEvent) {
    if (e.pointerType === "touch") touchX.current = e.clientX;
  }
  function onTouchUp(e: PointerEvent) {
    if (e.pointerType !== "touch" || touchX.current === null || media.length < 2) return;
    const dx = e.clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 30) return;
    setSwiped(true);
    setIndex((i) => (dx < 0 ? Math.min(i + 1, media.length - 1) : Math.max(i - 1, 0)));
  }

  return (
    <motion.article
      className="group/card bg-card relative flex h-full flex-col rounded-xl border p-2 shadow-sm transition-shadow duration-300 hover:shadow-xl sm:p-2.5"
      variants={canLift ? lift : undefined}
      initial="rest"
      animate={active ? "active" : "rest"}
      transition={SPRING}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div
        className="bg-muted relative aspect-square touch-pan-y overflow-hidden rounded-lg"
        onPointerDown={onTouchDown}
        onPointerUp={onTouchUp}
      >
        <Link href={href} className="absolute inset-0" tabIndex={-1} aria-hidden draggable={false}>
          {media.length === 0 ? (
            <span className="text-muted-foreground grid h-full place-items-center text-xs">No image</span>
          ) : (
            media.map((m, i) => {
              // Touch: only the current photo is visible. Mouse: photo 2 fades in on hover.
              const visible = i === index;
              const isHoverLayer = i === 1 && index === 0;
              if (i > 1 && !swiped) return null;
              return (
                <Layer
                  key={m.url}
                  media={m}
                  alt={i === 0 ? m.alt || title : ""}
                  eager={eager && i === 0}
                  videoRef={isHoverLayer && m.type === "video" && m.autoplay ? videoRef : undefined}
                  className={cn(
                    "transition-[opacity,transform] duration-500 ease-out",
                    visible ? "opacity-100" : "opacity-0",
                    isHoverLayer && "[@media(hover:hover)]:group-hover/card:opacity-100",
                    i === 0 && media.length > 1 && "[@media(hover:hover)]:group-hover/card:scale-105",
                  )}
                />
              );
            })
          )}
        </Link>

        {/* Labels (top-left) and discount (top-right) */}
        {/* One row, so on narrow phone cards the labels wrap below instead of hiding under the discount. */}
        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-1">
          <div className="flex min-w-0 flex-wrap gap-1">
            {product.labels.slice(0, 2).map((l) => (
              <span
                key={l}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase shadow-sm",
                  LOUD_LABELS.has(l)
                    ? "bg-brand text-brand-foreground"
                    : "bg-background/90 text-foreground backdrop-blur",
                )}
              >
                {LABELS[l] ?? l}
              </span>
            ))}
          </div>
          {(product.discount > 0 || product.maxDiscount > 0) && (
            <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-white shadow-sm">
              {product.discount > 0 ? `−${product.discount}%` : `Up to −${product.maxDiscount}%`}
            </span>
          )}
        </div>

        {/* Stock badge */}
        {product.stock && (
          <span
            className={cn(
              "pointer-events-none absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-[11px] font-medium shadow-sm transition-opacity",
              product.stock.kind === "soldOut"
                ? "bg-foreground text-background"
                : "bg-background/90 text-destructive backdrop-blur",
              active && "opacity-0",
            )}
          >
            {product.stock.kind === "soldOut" ? "Sold out" : `Only ${product.stock.left} left`}
          </span>
        )}

        {/* Touch: dots for the photos */}
        {media.length > 1 && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1 [@media(hover:hover)]:hidden"
            aria-hidden
          >
            {media.map((m, i) => (
              <span
                key={m.url}
                className={cn(
                  "size-1.5 rounded-full shadow transition-all",
                  i === index ? "w-3 bg-white" : "bg-white/60",
                )}
              />
            ))}
          </div>
        )}

        {/* Action bar: slides up on hover or keyboard focus */}
        <motion.div
          className="absolute inset-x-2 bottom-2 hidden gap-1.5 [@media(hover:hover)]:flex"
          variants={bar}
          initial="rest"
          animate={active ? "active" : "rest"}
          transition={reduce || level === "off" ? { duration: 0 } : SPRING}
        >
          {/* "Options" opens quick view to choose a variant; a single-option product goes straight to the cart. */}
          <Link
            href={href}
            onClick={quickView}
            onPointerEnter={prefetch}
            onFocus={prefetch}
            className="bg-background/95 hover:bg-background focus-visible:ring-ring flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium shadow-md backdrop-blur focus-visible:ring-2 focus-visible:outline-none"
            aria-label={`Quick view: ${title}`}
          >
            <Eye className="size-4" aria-hidden /> Quick view
          </Link>
          {oneClick ? (
            <button
              type="button"
              disabled={adding}
              onClick={() => void addToCart({ productId: product.id })}
              className="bg-brand text-brand-foreground hover:bg-brand/90 focus-visible:ring-ring flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-semibold shadow-md focus-visible:ring-2 focus-visible:outline-none disabled:opacity-70"
              aria-label={`Add to cart: ${title}`}
            >
              <ShoppingBag className="size-4" aria-hidden />
              Add to cart
            </button>
          ) : (
            <Link
              href={href}
              onClick={product.inStock ? quickView : undefined}
              onPointerEnter={prefetch}
              className={cn(
                "bg-brand text-brand-foreground hover:bg-brand/90 focus-visible:ring-ring flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-semibold shadow-md focus-visible:ring-2 focus-visible:outline-none",
                !product.inStock && "bg-muted text-muted-foreground hover:bg-muted",
              )}
              aria-label={`${product.inStock ? "Choose options" : "View"}: ${title}`}
            >
              <ShoppingBag className="size-4" aria-hidden />
              {product.inStock ? "Options" : "View"}
            </Link>
          )}
        </motion.div>
      </div>

      <div className="flex flex-1 flex-col gap-1 px-1 pt-2.5 pb-1">
        <h3 className="line-clamp-2 min-h-[2.5em] text-sm leading-tight font-medium">
          <Link
            href={href}
            className="focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            {title}
          </Link>
        </h3>
        {product.ratingCount > 0 && (
          <p className="text-muted-foreground flex items-center gap-1 text-xs">
            <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
            <span className="text-foreground font-medium">{product.ratingAvg.toFixed(1)}</span>
            <span>({product.ratingCount})</span>
            <span className="sr-only">
              rated {product.ratingAvg.toFixed(1)} out of 5 by {product.ratingCount} customers
            </span>
          </p>
        )}
        <p className="mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-1">
          {product.priceMax > product.price && <span className="text-muted-foreground text-xs">From</span>}
          <span className="text-base font-bold tabular-nums">{formatTaka(product.price)}</span>
          {product.compareAt > 0 && (
            <span className="text-muted-foreground text-xs tabular-nums line-through">
              <span className="sr-only">was </span>
              {formatTaka(product.compareAt)}
            </span>
          )}
        </p>
      </div>
    </motion.article>
  );
}

function Layer({
  media,
  alt,
  eager,
  className,
  videoRef,
}: {
  media: CardMedia;
  alt: string;
  eager: boolean;
  className?: string;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}) {
  const style: CSSProperties = {
    objectPosition: `${media.focalX}% ${media.focalY}%`,
    ...(media.blur ? { backgroundImage: `url(${media.blur})`, backgroundSize: "cover" } : {}),
  };
  const still = media.type === "video" ? media.poster : media.url;

  if (media.type === "video" && videoRef) {
    return (
      <video
        ref={videoRef}
        src={media.url}
        poster={media.poster || undefined}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden
        className={cn("absolute inset-0 size-full object-cover", className)}
        style={style}
      />
    );
  }
  if (!still) return null; // a video without a poster can't be shown as a still
  return (
    <Image
      src={still}
      alt={alt}
      fill
      sizes={SIZES}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      draggable={false}
      className={cn("object-cover", className)}
      style={style}
    />
  );
}
