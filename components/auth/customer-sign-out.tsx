"use client";

import { useRouter } from "next/navigation";
import { forgetCart } from "@/components/store/cart/cart-store";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Signs a customer out. Their cart stays with their account; this browser starts with an empty one. */
export function CustomerSignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        forgetCart();
        router.replace("/");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
