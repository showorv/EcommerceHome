import type { Metadata } from "next";
import { CheckoutView } from "@/components/store/checkout/checkout-view";
import { getDeliveryConfig } from "@/modules/delivery/data";

/**
 * Checkout (FR-CO-02). The frame and the delivery areas are built once (cached until the delivery
 * settings change); the cart and the form live in the browser. Kept out of search engines.
 */

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const config = await getDeliveryConfig();
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-16">
      <h1 className="mb-6 text-2xl font-bold tracking-tight md:text-3xl">Checkout</h1>
      <CheckoutView config={config} />
    </div>
  );
}
