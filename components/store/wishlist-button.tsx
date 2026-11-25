"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toggleWishlist, useWishlisted } from "./wishlist-store";

/** Guests: offer sign-in, then come back to this page. */
export function useWishlistToggle() {
  const router = useRouter();
  return async (productId: string, title: string) => {
    if ((await toggleWishlist(productId, title)) !== "signIn") return;
    const next = `${window.location.pathname}${window.location.search}`;
    toast("Sign in to save products to your wishlist.", {
      action: { label: "Sign in", onClick: () => router.push(`/account/sign-in?next=${encodeURIComponent(next)}`) },
    });
  };
}

/** The heart on product cards and the product page (FR-PC-01, FR-AC-06). */
export function WishlistButton({
  productId,
  title,
  variant = "overlay",
  className,
}: {
  productId: string;
  title: string;
  /** "overlay": round button over a card's image. "inline": next to the buy buttons. */
  variant?: "overlay" | "inline";
  className?: string;
}) {
  const saved = useWishlisted(productId);
  const toggle = useWishlistToggle();
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove from wishlist: ${title}` : `Save to wishlist: ${title}`}
      title={saved ? "Saved to your wishlist" : "Save to wishlist"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle(productId, title);
      }}
      className={cn(
        "focus-visible:ring-ring grid place-items-center transition-colors focus-visible:ring-2 focus-visible:outline-none",
        variant === "overlay"
          ? "bg-background/90 hover:bg-background size-9 rounded-full shadow-md backdrop-blur"
          : "hover:bg-accent size-11 shrink-0 rounded-md border",
        className,
      )}
    >
      <Heart
        className={cn("size-[18px] transition-transform", saved ? "fill-red-500 text-red-500" : "text-foreground/80")}
        aria-hidden
      />
    </button>
  );
}
