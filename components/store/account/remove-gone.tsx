"use client";

import { useWishlistToggle } from "@/components/store/wishlist-button";
import { useWishlistIds } from "@/components/store/wishlist-store";
import { Button } from "@/components/ui/button";

/** Saved products the shop no longer sells: listed so they can be removed. */
export function RemoveGone({ items }: { items: { id: string; title: string }[] }) {
  const ids = useWishlistIds();
  const toggle = useWishlistToggle();
  const left = ids ? items.filter((i) => ids.has(i.id)) : items;
  if (left.length === 0) return null;
  return (
    <section className="grid gap-2 rounded-lg border p-4 text-sm" aria-labelledby="gone-title">
      <h2 id="gone-title" className="font-medium">
        No longer available
      </h2>
      <ul className="grid gap-2">
        {left.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{i.title || "A product that was removed"}</span>
            <Button variant="ghost" size="sm" onClick={() => void toggle(i.id, i.title || "Product")}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
