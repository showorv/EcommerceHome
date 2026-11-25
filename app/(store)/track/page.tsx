import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TrackForm, TrackFormFromUrl } from "@/components/store/account/track-form";

export const metadata: Metadata = {
  title: "Track your order",
  description: "See where your order is with its order number and your mobile number.",
};

/** Guest order tracking (FR-AC-07). Static page; the lookup is a rate-limited server action. */
export default function TrackPage() {
  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 pt-6 pb-16 md:pt-10">
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Track your order</h1>
        <p className="text-muted-foreground text-sm">
          Enter the order number from your SMS or the thank-you page, and the mobile number you ordered with. Have an
          account?{" "}
          <Link href="/account/orders" className="text-foreground underline underline-offset-2">
            See all your orders
          </Link>
          .
        </p>
      </div>
      <Suspense fallback={<TrackForm />}>
        <TrackFormFromUrl />
      </Suspense>
    </div>
  );
}
