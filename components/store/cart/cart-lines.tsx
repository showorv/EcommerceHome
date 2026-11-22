"use client";

import { ImageOff, Minus, Plus, Trash2, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import { freeDeliveryGap, type CartLine, type CartView } from "@/modules/cart/view";
import { setLineQty } from "./cart-store";

const PROBLEM: Record<NonNullable<CartLine["problem"]>, (l: CartLine) => string> = {
  unavailable: () => "No longer available. Please remove it.",
  soldOut: () => "Sold out. Please remove it.",
  tooMany: (l) => `Only ${l.maxQty} available. Please lower the quantity.`,
};

/** The products in the cart, used by the drawer and the cart page. */
export function CartLines({
  cart,
  busy,
  size = "sm",
  onNavigate,
}: {
  cart: CartView;
  busy: string[];
  size?: "sm" | "lg";
  onNavigate?: () => void;
}) {
  const img = size === "lg" ? 96 : 72;
  return (
    <ul className="divide-y">
      {cart.lines.map((l) => {
        const pending = busy.includes(l.variantId);
        const name = l.title + (l.variantTitle ? ` (${l.variantTitle})` : "");
        return (
          <li key={l.variantId} className={cn("flex gap-3 py-4", pending && "opacity-70")}>
            <Link
              href={`/p/${l.slug}`}
              onClick={onNavigate}
              className="bg-muted relative shrink-0 overflow-hidden rounded-md"
              style={{ width: img, height: img }}
              tabIndex={-1}
              aria-hidden
            >
              {l.image ? (
                <Image src={l.image.url} alt="" fill sizes={`${img}px`} className="object-cover" />
              ) : (
                <ImageOff className="text-muted-foreground absolute inset-0 m-auto size-5" />
              )}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/p/${l.slug}`}
                    onClick={onNavigate}
                    className={cn("line-clamp-2 font-medium hover:underline", size === "lg" ? "text-base" : "text-sm")}
                  >
                    {l.title}
                  </Link>
                  {l.variantTitle && <p className="text-muted-foreground text-xs">{l.variantTitle}</p>}
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums">
                  {l.problem === "unavailable" ? "—" : formatTaka(l.price * l.qty)}
                </p>
              </div>
              {l.qty > 1 && l.problem !== "unavailable" && (
                <p className="text-muted-foreground text-xs tabular-nums">{formatTaka(l.price)} each</p>
              )}
              {l.problem && (
                <p className="text-destructive text-xs font-medium" role="status">
                  {PROBLEM[l.problem](l)}
                </p>
              )}
              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                <div className="flex items-center rounded-md border" role="group" aria-label={`Quantity of ${name}`}>
                  <button
                    type="button"
                    className="hover:bg-accent grid size-8 place-items-center rounded-l-md disabled:opacity-40"
                    onClick={() => void setLineQty(l.variantId, l.qty - 1)}
                    disabled={pending || l.qty <= 1}
                    aria-label={`One less ${name}`}
                  >
                    <Minus className="size-3.5" aria-hidden />
                  </button>
                  <span className="w-8 text-center text-sm font-medium tabular-nums" aria-live="polite">
                    {l.qty}
                  </span>
                  <button
                    type="button"
                    className="hover:bg-accent grid size-8 place-items-center rounded-r-md disabled:opacity-40"
                    onClick={() => void setLineQty(l.variantId, l.qty + 1)}
                    disabled={pending || l.qty >= l.maxQty}
                    aria-label={`One more ${name}`}
                  >
                    <Plus className="size-3.5" aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive flex items-center gap-1 rounded-md px-2 py-1 text-xs"
                  onClick={() => void setLineQty(l.variantId, 0)}
                  disabled={pending}
                  aria-label={`Remove ${name}`}
                >
                  <Trash2 className="size-3.5" aria-hidden /> Remove
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** "Add ৳350 more for free delivery" with a progress bar, when the store has that rule. */
export function FreeDeliveryNote({ cart }: { cart: CartView }) {
  const gap = freeDeliveryGap(cart);
  if (gap === null || !cart.freeAbove) return null;
  const pct = Math.min(100, Math.round((cart.subtotal / cart.freeAbove) * 100));
  return (
    <div className="grid gap-1.5">
      <p className="flex items-center gap-1.5 text-sm">
        <Truck className="text-brand size-4 shrink-0" aria-hidden />
        {gap === 0 ? (
          <span className="font-medium">You get free delivery.</span>
        ) : (
          <span>
            Add <strong className="tabular-nums">{formatTaka(gap)}</strong> more for free delivery.
          </span>
        )}
      </p>
      <div
        className="bg-muted h-1.5 overflow-hidden rounded-full"
        role="progressbar"
        aria-label="Towards free delivery"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="bg-brand h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
