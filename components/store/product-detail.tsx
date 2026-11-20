"use client";

import { ShoppingBag, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProductView } from "@/modules/catalog/storefront";
import { LabelChips, PriceLine, QuantityStepper, Rating, StockLine, useVariantChoice } from "./buy-parts";
import { MediaGallery } from "./media-gallery";
import { VariantOptions } from "./variant-options";

/**
 * Top of the product page (FR-PD-01, 02, 05): gallery with zoom + lightbox, title, price, stock, options,
 * quantity, "Order now" and "Add to cart". On phones a bar with the price and the button sticks to the
 * bottom of the screen once the main buttons scroll out of view.
 */
export function ProductDetail({ product }: { product: ProductView }) {
  const c = useVariantChoice(product);
  const title = product.title.en;
  const soldOut = c.available === 0;
  const actions = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);

  useEffect(() => {
    const el = actions.current;
    if (!el) return;
    // Show the sticky bar once the buttons have scrolled up behind the site header (56px), hide it again
    // when they come back. A scroll check (once per frame) also handles jumps, e.g. "back to top".
    // One cheap position read per scroll event; React skips the re-render when the answer is unchanged.
    const check = () => setShowBar(el.getBoundingClientRect().bottom < 64);
    const first = setTimeout(check, 0); // the page may open already scrolled (e.g. after Back)
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      clearTimeout(first);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  // Both buttons are switched on with the cart and checkout in Phase 2 (2.2, 2.3).
  const orderButton = (className: string) => (
    <Button
      size="lg"
      className={cn("bg-brand text-brand-foreground hover:bg-brand/90", className)}
      disabled
      aria-describedby="pd-cart-note"
    >
      <Zap className="size-4" aria-hidden />
      {soldOut ? "Sold out" : "Order now"}
    </Button>
  );
  const cartButton = (className: string) => (
    <Button size="lg" variant="outline" className={className} disabled aria-describedby="pd-cart-note">
      <ShoppingBag className="size-4" aria-hidden />
      Add to cart
    </Button>
  );

  return (
    <>
      <div className="grid gap-8 md:grid-cols-2 lg:gap-12">
        <MediaGallery
          media={product.media}
          title={title}
          activeId={c.variant?.mediaIds[0]}
          zoom
          sizes="(min-width: 1280px) 600px, (min-width: 768px) 50vw, 100vw"
          className="md:sticky md:top-20 md:self-start"
        />

        <div className="flex flex-col gap-5">
          <LabelChips labels={product.labels} />
          <div className="grid gap-1">
            <h1 className="text-2xl leading-tight font-extrabold tracking-tight md:text-3xl">{title}</h1>
            {product.title.bn && (
              <p lang="bn" className="text-muted-foreground text-lg">
                {product.title.bn}
              </p>
            )}
            <Rating avg={product.ratingAvg} count={product.ratingCount} />
          </div>

          {c.variant && <PriceLine price={c.variant.price} compareAt={c.variant.compareAt} />}
          <StockLine stock={c.stock} />

          {product.shortDescription.en && (
            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{product.shortDescription.en}</p>
          )}

          <VariantOptions
            optionNames={product.optionNames}
            variants={product.variants}
            selection={c.selection}
            onChange={c.choose}
          />

          <QuantityStepper id="pd-qty" quantity={c.quantity} max={c.maxQty} disabled={soldOut} onChange={c.setQty} />

          <div ref={actions} className="grid gap-3 sm:grid-cols-2">
            {orderButton("w-full")}
            {cartButton("w-full")}
          </div>
          <p id="pd-cart-note" className="text-muted-foreground -mt-2 text-xs">
            Ordering online is coming soon.
          </p>
        </div>
      </div>

      {/* Sticky buy bar for phones (FR-PD-05) */}
      <div
        className={cn(
          "bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] backdrop-blur transition-transform duration-300 md:hidden",
          showBar ? "translate-y-0" : "pointer-events-none translate-y-full",
        )}
        aria-hidden={!showBar}
        inert={!showBar}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">
              {title}
              {c.variant?.title ? ` · ${c.variant.title}` : ""}
            </p>
            {c.variant && <PriceLine price={c.variant.price} compareAt={c.variant.compareAt} size="sm" />}
          </div>
          {orderButton("shrink-0")}
        </div>
      </div>
    </>
  );
}
