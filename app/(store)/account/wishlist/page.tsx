import type { Metadata } from "next";
import { AccountFrame } from "@/components/store/account/account-frame";
import { RemoveGone } from "@/components/store/account/remove-gone";
import { WishlistGrid } from "@/components/store/account/wishlist-grid";
import { requireCustomer, wishlistProducts } from "@/modules/account/data";

export const metadata: Metadata = { title: "My wishlist", robots: { index: false, follow: false } };

/** Saved products (FR-AC-06). */
export default function WishlistPage() {
  return (
    <AccountFrame title="My wishlist">
      <Wishlist />
    </AccountFrame>
  );
}

async function Wishlist() {
  const c = await requireCustomer("/account/wishlist");
  const { products, gone } = await wishlistProducts(c.id);
  return (
    <div className="grid gap-5">
      <WishlistGrid products={products} />
      {gone.length > 0 && <RemoveGone items={gone} />}
    </div>
  );
}
