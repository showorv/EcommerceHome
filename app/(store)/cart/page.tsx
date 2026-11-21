import type { Metadata } from "next";
import { CartPageView } from "@/components/store/cart/cart-page";

/** The cart (FR-CO-01). A static frame; the cart itself loads in the browser. Kept out of search engines. */

export const metadata: Metadata = {
  title: "Your cart",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-16">
      <h1 className="mb-6 text-2xl font-bold tracking-tight md:text-3xl">Your cart</h1>
      <CartPageView />
    </div>
  );
}
