"use client";

import { ShoppingBag, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatTaka } from "@/lib/money";
import { CartLines, FreeDeliveryNote } from "./cart-lines";
import { setCartOpen, useCart } from "./cart-store";

/** Header cart button with the number of items. */
export function CartButton() {
  const { cart } = useCart();
  return (
    <button
      type="button"
      onClick={() => setCartOpen(true)}
      className="hover:bg-accent relative -mr-2 grid size-10 place-items-center rounded-full"
      aria-label={cart.count > 0 ? `Cart, ${cart.count} item${cart.count === 1 ? "" : "s"}` : "Cart"}
    >
      <ShoppingBag className="size-5" aria-hidden />
      {cart.count > 0 && (
        <span className="bg-brand text-brand-foreground absolute top-0.5 right-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full px-1 text-[10px] leading-none font-bold tabular-nums">
          {cart.count > 99 ? "99+" : cart.count}
        </span>
      )}
    </button>
  );
}

/** Slide-out cart (FR-CO-01). Mounted once in the store layout; any "Add to cart" opens it. */
export function CartDrawer() {
  const { cart, open, busy } = useCart();
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setCartOpen(false);
  }
  const close = () => setCartOpen(false);

  return (
    <Dialog open={open} onOpenChange={setCartOpen}>
      <DialogContent
        showCloseButton={false}
        className="data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 top-0 right-0 left-auto grid h-dvh w-full max-w-md translate-x-0 translate-y-0 grid-rows-[auto_1fr_auto] gap-0 overflow-hidden rounded-none p-0 sm:max-w-md"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <DialogTitle className="text-base">
            Your cart{cart.count > 0 && <span className="text-muted-foreground font-normal"> · {cart.count}</span>}
          </DialogTitle>
          <DialogDescription className="sr-only">Products in your cart</DialogDescription>
          <DialogClose className="hover:bg-accent grid size-9 place-items-center rounded-full" aria-label="Close cart">
            <X className="size-5" aria-hidden />
          </DialogClose>
        </div>

        {cart.lines.length === 0 ? (
          <div className="grid place-content-center gap-3 p-8 text-center">
            <ShoppingBag className="text-muted-foreground mx-auto size-10" aria-hidden />
            <p className="font-medium">Your cart is empty</p>
            <Button asChild variant="outline" onClick={close}>
              <Link href="/search">Browse products</Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-y-auto px-4">
            <CartLines cart={cart} busy={busy} onNavigate={close} />
          </div>
        )}

        {cart.lines.length > 0 && (
          <div className="grid gap-3 border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <FreeDeliveryNote cart={cart} />
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground text-sm">Subtotal</span>
              <span className="text-lg font-bold tabular-nums">{formatTaka(cart.subtotal)}</span>
            </div>
            <p className="text-muted-foreground -mt-2 text-xs">Delivery charge is added at checkout.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline" onClick={close}>
                <Link href="/cart">View cart</Link>
              </Button>
              <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={close}>
                {/* Checkout arrives in 2.3; until then the cart page explains the next step. */}
                <Link href="/cart">Checkout</Link>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
