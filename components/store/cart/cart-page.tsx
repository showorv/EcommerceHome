"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatTaka } from "@/lib/money";
import { CartLines, FreeDeliveryNote } from "./cart-lines";
import { useCart } from "./cart-store";

/** The full cart page (FR-CO-01). */
export function CartPageView() {
  const { cart, busy, synced } = useCart();

  if (cart.lines.length === 0) {
    return (
      <div className="grid place-items-center gap-4 rounded-lg border border-dashed px-4 py-16 text-center">
        <ShoppingBag className="text-muted-foreground size-10" aria-hidden />
        <div className="grid gap-1">
          <p className="text-lg font-semibold">{synced ? "Your cart is empty" : "Loading your cart…"}</p>
          {synced && <p className="text-muted-foreground text-sm">Products you add will wait here for you.</p>}
        </div>
        {synced && (
          <Button asChild>
            <Link href="/search">Browse products</Link>
          </Button>
        )}
      </div>
    );
  }

  const units = cart.lines.filter((l) => l.problem === null).reduce((n, l) => n + l.qty, 0);
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      <section aria-label="Products in your cart" className="rounded-lg border px-4">
        <CartLines cart={cart} busy={busy} size="lg" />
      </section>

      <aside className="bg-card grid gap-4 rounded-lg border p-5 lg:sticky lg:top-24">
        <h2 className="text-lg font-semibold">Order summary</h2>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              Products ({units} item{units === 1 ? "" : "s"})
            </dt>
            <dd className="font-medium tabular-nums">{formatTaka(cart.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Delivery</dt>
            <dd className="text-muted-foreground">At checkout, by your area</dd>
          </div>
          <div className="flex justify-between border-t pt-2 text-base">
            <dt className="font-semibold">Subtotal</dt>
            <dd className="font-bold tabular-nums">{formatTaka(cart.subtotal)}</dd>
          </div>
        </dl>
        <FreeDeliveryNote cart={cart} />
        {cart.hasProblems && (
          <p className="text-destructive text-sm" role="status">
            Some products need your attention before you order.
          </p>
        )}
        {cart.hasProblems ? (
          <Button size="lg" className="w-full" disabled>
            Checkout
          </Button>
        ) : (
          <Button asChild size="lg" className="bg-brand text-brand-foreground hover:bg-brand/90 w-full">
            <Link href="/checkout">Checkout</Link>
          </Button>
        )}
        <Button asChild variant="outline" className="w-full">
          <Link href="/search">Continue shopping</Link>
        </Button>
      </aside>
    </div>
  );
}
