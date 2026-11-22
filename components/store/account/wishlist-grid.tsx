"use client";

import Link from "next/link";
import { ProductGrid } from "@/components/store/product-grid";
import { useWishlistIds } from "@/components/store/wishlist-store";
import { Button } from "@/components/ui/button";
import type { CardProduct } from "@/modules/catalog/storefront";

/** The saved products; one un-hearted here disappears at once. */
export function WishlistGrid({ products }: { products: CardProduct[] }) {
  const ids = useWishlistIds();
  const shown = ids ? products.filter((p) => ids.has(p.id)) : products;
  if (shown.length === 0) {
    return (
      <div className="text-muted-foreground grid justify-items-start gap-3 rounded-lg border border-dashed p-5 text-sm">
        <p>Your wishlist is empty. Tap the heart on any product to save it here.</p>
        <Button asChild size="sm">
          <Link href="/">Browse products</Link>
        </Button>
      </div>
    );
  }
  return <ProductGrid products={shown} wishlist className="xl:grid-cols-3" />;
}
