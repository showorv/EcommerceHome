"use client";

import { ArrowRight, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SLUG_RE } from "@/modules/catalog/logic";
import type { ProductView } from "@/modules/catalog/storefront";
import { addToCart, useCartAdding } from "./cart/cart-store";
import { LabelChips, PriceLine, QuantityStepper, Rating, StockLine, useVariantChoice } from "./buy-parts";
import { MediaGallery } from "./media-gallery";
import { VariantOptions } from "./variant-options";

/**
 * Quick view (FR-PC-04). Opening adds ?product=<slug> to the current URL, so the link can be shared
 * (it opens the same page with the popup) and the Back button closes it. Mounted once in the store layout.
 */

export const QUICK_VIEW_PARAM = "product";

// ---------- Data (small in-memory cache so reopening and hover-prefetch are instant) ----------

const loaded = new Map<string, Promise<ProductView | null>>();

function loadProduct(slug: string): Promise<ProductView | null> {
  let p = loaded.get(slug);
  if (!p) {
    p = fetch(`/api/products/${encodeURIComponent(slug)}/view`)
      .then((r) => (r.ok ? (r.json() as Promise<ProductView>) : null))
      .catch(() => null);
    // Failed loads are retried next time; good ones are reused for this visit (the server keeps them fresh).
    p.then((v) => v === null && loaded.delete(slug)).catch(() => {});
    loaded.set(slug, p);
  }
  return p;
}

/** Start loading on hover/focus so the popup usually opens already filled. */
export function prefetchQuickView(slug: string) {
  if (SLUG_RE.test(slug)) void loadProduct(slug);
}

// ---------- Opening and closing ----------

let openedHere = false; // true when we pushed the URL ourselves, so closing can simply go Back

export function useOpenQuickView() {
  const router = useRouter();
  return useCallback(
    (slug: string) => {
      const url = new URL(window.location.href);
      url.searchParams.set(QUICK_VIEW_PARAM, slug);
      openedHere = true;
      router.push(url.pathname + url.search + url.hash, { scroll: false });
    },
    [router],
  );
}

export function QuickViewHost() {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get(QUICK_VIEW_PARAM);
  const slug = raw && raw.length <= 120 && SLUG_RE.test(raw) ? raw : null;
  const [result, setResult] = useState<{ slug: string; product: ProductView | null } | null>(null);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    loadProduct(slug).then((product) => alive && setResult({ slug, product }));
    return () => {
      alive = false;
    };
  }, [slug]);

  function close() {
    if (openedHere) {
      openedHere = false;
      router.back();
      return;
    }
    // Opened from a shared link: remove the parameter without adding a history entry.
    const url = new URL(window.location.href);
    url.searchParams.delete(QUICK_VIEW_PARAM);
    router.replace(url.pathname + url.search + url.hash, { scroll: false });
  }

  // Navigating away (e.g. "View full details") ends the popup's history entry.
  useEffect(() => {
    if (!raw) openedHere = false;
  }, [raw]);

  const current = result && result.slug === slug ? result : null;

  return (
    <Dialog open={!!raw} onOpenChange={(open) => !open && close()}>
      <DialogContent
        className={cn(
          "max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-4xl",
          // The close button sits over the photo on phones, so give it its own background.
          "[&>[data-slot=dialog-close]]:bg-background/90 [&>[data-slot=dialog-close]]:top-3 [&>[data-slot=dialog-close]]:right-3 [&>[data-slot=dialog-close]]:z-10 [&>[data-slot=dialog-close]]:grid [&>[data-slot=dialog-close]]:size-9 [&>[data-slot=dialog-close]]:place-items-center [&>[data-slot=dialog-close]]:rounded-full [&>[data-slot=dialog-close]]:opacity-100 [&>[data-slot=dialog-close]]:shadow",
        )}
      >
        {!slug || (current && !current.product) ? (
          <div className="grid gap-3 p-8 text-center">
            <DialogTitle>Product not available</DialogTitle>
            <DialogDescription>It may have been removed or is no longer on sale.</DialogDescription>
          </div>
        ) : !current?.product ? (
          <LoadingBody />
        ) : (
          <QuickViewBody key={current.product.id} product={current.product} onAdded={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LoadingBody() {
  return (
    <div className="grid gap-6 p-4 md:grid-cols-2 md:p-6" aria-busy="true">
      <DialogTitle className="sr-only">Loading product</DialogTitle>
      <DialogDescription className="sr-only">Please wait a moment.</DialogDescription>
      <div className="bg-muted aspect-square animate-pulse rounded-lg" />
      <div className="grid content-start gap-3 pt-2">
        <div className="bg-muted h-6 w-3/4 animate-pulse rounded" />
        <div className="bg-muted h-5 w-1/3 animate-pulse rounded" />
        <div className="bg-muted mt-4 h-10 w-full animate-pulse rounded" />
      </div>
    </div>
  );
}

// ---------- Content ----------

function QuickViewBody({ product, onAdded }: { product: ProductView; onAdded: () => void }) {
  const c = useVariantChoice(product);
  const adding = useCartAdding();
  const href = `/p/${product.slug}`;
  const title = product.title.en;

  return (
    <div className="grid gap-6 p-4 md:grid-cols-2 md:p-6">
      <MediaGallery media={product.media} title={title} activeId={c.variant?.mediaIds[0]} />

      <div className="flex flex-col gap-4 md:pt-2">
        <LabelChips labels={product.labels} />

        <div className="grid gap-1 pr-8">
          <DialogTitle className="text-xl leading-tight font-bold md:text-2xl">{title}</DialogTitle>
          {product.title.bn && (
            <p lang="bn" className="text-muted-foreground">
              {product.title.bn}
            </p>
          )}
          <Rating avg={product.ratingAvg} count={product.ratingCount} />
        </div>

        {c.variant && <PriceLine price={c.variant.price} compareAt={c.variant.compareAt} />}
        <StockLine stock={c.stock} />

        <DialogDescription className={cn("text-sm", !product.shortDescription.en && "sr-only")}>
          {product.shortDescription.en || `Quick view of ${title}`}
        </DialogDescription>

        <VariantOptions
          optionNames={product.optionNames}
          variants={product.variants}
          selection={c.selection}
          onChange={c.choose}
        />

        <div className="mt-auto grid gap-3 pt-2">
          <QuantityStepper
            id="qv-qty"
            quantity={c.quantity}
            max={c.maxQty}
            disabled={c.available === 0}
            onChange={c.setQty}
          />

          <Button
            size="lg"
            className="bg-brand text-brand-foreground hover:bg-brand/90 w-full"
            disabled={c.available === 0 || !c.variant || adding}
            onClick={() => {
              if (!c.variant) return;
              // The popup closes so the cart drawer can open in its place.
              const variantId = c.variant.id;
              void addToCart({ variantId }, c.quantity).then((ok) => ok && onAdded());
            }}
          >
            <ShoppingBag className="size-4" aria-hidden />
            {c.available === 0 ? "Sold out" : adding ? "Adding…" : "Add to cart"}
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href={href}>
              View full details <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
