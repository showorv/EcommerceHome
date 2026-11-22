"use client";

import { useRouter } from "next/navigation";
import { forgetCart } from "@/components/store/cart/cart-store";
import { forgetCheckoutDraft } from "@/components/store/checkout/draft";
import { forgetWishlist } from "@/components/store/wishlist-store";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Signs a customer out. Their cart stays with their account; this browser forgets it, the wishlist and the checkout details. */
export function CustomerSignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        forgetCart();
        forgetWishlist();
        forgetCheckoutDraft();
        router.replace("/");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
