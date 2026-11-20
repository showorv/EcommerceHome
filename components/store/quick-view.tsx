"use client";

import { ArrowRight, Minus, Plus, ShoppingBag, Star } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import { discountPercent, SLUG_RE, stockBadge } from "@/modules/catalog/logic";
import type { ProductView } from "@/modules/catalog/storefront";
import { defaultSelection, findVariant, type Selection } from "@/modules/catalog/variant-picker";
import { LABELS, LOUD_LABELS } from "./labels";
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
          <QuickViewBody key={current.product.id} product={current.product} />
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

function QuickViewBody({ product }: { product: ProductView }) {
  const [selection, setSelection] = useState<Selection>(() => defaultSelection(product.variants));
  const [qty, setQty] = useState(1);
  const variant = findVariant(product.variants, selection) ?? product.variants[0] ?? null;
  const available = variant?.available ?? 0;
  const maxQty = Math.max(1, Math.min(available, 10));
  const quantity = Math.min(qty, maxQty);
  const off = variant ? discountPercent(variant.price, variant.compareAt) : 0;
  const stock = stockBadge(available, product.lowStockAt);
  const href = `/p/${product.slug}`;
  const title = product.title.en;

  return (
    <div className="grid gap-6 p-4 md:grid-cols-2 md:p-6">
      <MediaGallery media={product.media} title={title} activeId={variant?.mediaIds[0]} />

      <div className="flex flex-col gap-4 md:pt-2">
        {product.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {product.labels.map((l) => (
              <span
                key={l}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
                  LOUD_LABELS.has(l) ? "bg-brand text-brand-foreground" : "bg-secondary",
                )}
              >
                {LABELS[l] ?? l}
              </span>
            ))}
          </div>
        )}

        <div className="grid gap-1 pr-8">
          <DialogTitle className="text-xl leading-tight font-bold md:text-2xl">{title}</DialogTitle>
          {product.title.bn && (
            <p lang="bn" className="text-muted-foreground">
              {product.title.bn}
            </p>
          )}
          {product.ratingCount > 0 && (
            <p className="text-muted-foreground flex items-center gap-1 text-sm">
              <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
              <span className="text-foreground font-medium">{product.ratingAvg.toFixed(1)}</span>({product.ratingCount}{" "}
              reviews)
            </p>
          )}
        </div>

        {variant && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-2xl font-bold tabular-nums">{formatTaka(variant.price)}</span>
            {off > 0 && (
              <>
                <span className="text-muted-foreground tabular-nums line-through">
                  <span className="sr-only">was </span>
                  {formatTaka(variant.compareAt)}
                </span>
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">−{off}%</span>
              </>
            )}
          </div>
        )}

        <p
          className={cn(
            "text-sm font-medium",
            !stock ? "text-success" : stock.kind === "soldOut" ? "text-muted-foreground" : "text-destructive",
          )}
          role="status"
        >
          {!stock ? "In stock" : stock.kind === "soldOut" ? "Sold out" : `Only ${stock.left} left, order soon`}
        </p>

        <DialogDescription className={cn("text-sm", !product.shortDescription.en && "sr-only")}>
          {product.shortDescription.en || `Quick view of ${title}`}
        </DialogDescription>

        <VariantOptions
          optionNames={product.optionNames}
          variants={product.variants}
          selection={selection}
          onChange={(next) => {
            setSelection(next);
            setQty(1);
          }}
        />

        <div className="mt-auto grid gap-3 pt-2">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm" id="qv-qty">
              Quantity
            </span>
            <div className="flex items-center rounded-md border" role="group" aria-labelledby="qv-qty">
              <button
                type="button"
                className="hover:bg-accent grid size-9 place-items-center rounded-l-md disabled:opacity-40"
                onClick={() => setQty(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                aria-label="One less"
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <span className="w-10 text-center text-sm font-medium tabular-nums" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                className="hover:bg-accent grid size-9 place-items-center rounded-r-md disabled:opacity-40"
                onClick={() => setQty(Math.min(maxQty, quantity + 1))}
                disabled={quantity >= maxQty || available === 0}
                aria-label="One more"
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          {/* The cart arrives in Phase 2 (2.2); this button is wired to it then. */}
          <Button
            size="lg"
            className="bg-brand text-brand-foreground hover:bg-brand/90 w-full"
            disabled
            aria-describedby="qv-cart-note"
          >
            <ShoppingBag className="size-4" aria-hidden />
            {available === 0 ? "Sold out" : "Add to cart"}
          </Button>
          <p id="qv-cart-note" className="text-muted-foreground -mt-1 text-center text-xs">
            Adding to cart is coming soon.
          </p>
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
