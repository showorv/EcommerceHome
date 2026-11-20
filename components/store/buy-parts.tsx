"use client";

import { Minus, Plus, Star } from "lucide-react";
import { useState } from "react";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import { discountPercent, stockBadge } from "@/modules/catalog/logic";
import type { ProductView } from "@/modules/catalog/storefront";
import { defaultSelection, findVariant, type Selection } from "@/modules/catalog/variant-picker";
import { LABELS, LOUD_LABELS } from "./labels";

/** Shared pieces of the buy area, used by quick view and the product page so both behave the same. */

export function useVariantChoice(product: ProductView) {
  const [selection, setSelection] = useState<Selection>(() => defaultSelection(product.variants));
  const [qty, setQty] = useState(1);
  const variant = findVariant(product.variants, selection) ?? product.variants[0] ?? null;
  const available = variant?.available ?? 0;
  const maxQty = Math.max(1, Math.min(available, 10));
  return {
    selection,
    choose(next: Selection) {
      setSelection(next);
      setQty(1);
    },
    variant,
    available,
    maxQty,
    quantity: Math.min(qty, maxQty),
    setQty,
    stock: stockBadge(available, product.lowStockAt),
  };
}

export function LabelChips({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((l) => (
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
  );
}

export function Rating({ avg, count }: { avg: number; count: number }) {
  if (count <= 0) return null;
  return (
    <p className="text-muted-foreground flex items-center gap-1 text-sm">
      <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
      <span className="text-foreground font-medium">{avg.toFixed(1)}</span>({count} reviews)
    </p>
  );
}

export function PriceLine({ price, compareAt, size = "lg" }: { price: number; compareAt: number; size?: "lg" | "sm" }) {
  const off = discountPercent(price, compareAt);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className={cn("font-bold tabular-nums", size === "lg" ? "text-2xl" : "text-lg")}>{formatTaka(price)}</span>
      {off > 0 && (
        <>
          <span className={cn("text-muted-foreground tabular-nums line-through", size === "sm" && "text-xs")}>
            <span className="sr-only">was </span>
            {formatTaka(compareAt)}
          </span>
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">−{off}%</span>
        </>
      )}
    </div>
  );
}

export function StockLine({ stock }: { stock: ReturnType<typeof stockBadge> }) {
  return (
    <p
      className={cn(
        "text-sm font-medium",
        !stock ? "text-success" : stock.kind === "soldOut" ? "text-muted-foreground" : "text-destructive",
      )}
      role="status"
    >
      {!stock ? "In stock" : stock.kind === "soldOut" ? "Sold out" : `Only ${stock.left} left, order soon`}
    </p>
  );
}

export function QuantityStepper({
  id,
  quantity,
  max,
  disabled,
  onChange,
}: {
  id: string;
  quantity: number;
  max: number;
  disabled?: boolean;
  onChange: (q: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground text-sm" id={id}>
        Quantity
      </span>
      <div className="flex items-center rounded-md border" role="group" aria-labelledby={id}>
        <button
          type="button"
          className="hover:bg-accent grid size-10 place-items-center rounded-l-md disabled:opacity-40"
          onClick={() => onChange(Math.max(1, quantity - 1))}
          disabled={disabled || quantity <= 1}
          aria-label="One less"
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <span className="w-10 text-center text-sm font-medium tabular-nums" aria-live="polite">
          {quantity}
        </span>
        <button
          type="button"
          className="hover:bg-accent grid size-10 place-items-center rounded-r-md disabled:opacity-40"
          onClick={() => onChange(Math.min(max, quantity + 1))}
          disabled={disabled || quantity >= max}
          aria-label="One more"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
