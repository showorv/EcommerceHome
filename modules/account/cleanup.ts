import { connectMongoose } from "@/lib/db/mongo";
import { Cart } from "@/modules/cart/models";
import { Order } from "@/modules/orders/models";
import { Address, WishlistItem } from "./models";

/**
 * What goes when a customer deletes their account (FR-AC-06), run by Better Auth just before it removes
 * the user, their sign-ins and sessions. Addresses, wishlist and cart are deleted. Orders stay: the shop
 * needs them for its accounts, deliveries and returns; they are only unlinked from the account.
 * Not server-only: auth.ts (and so this) also loads in scripts.
 */
export async function removeCustomerData(
  userId: string,
): Promise<{ addresses: number; wishlist: number; carts: number; orders: number }> {
  await connectMongoose();
  const [a, w, c, o] = await Promise.all([
    Address.deleteMany({ userId }),
    WishlistItem.deleteMany({ userId }),
    Cart.deleteMany({ userId }),
    Order.updateMany({ userId }, { $set: { userId: null } }),
  ]);
  return { addresses: a.deletedCount, wishlist: w.deletedCount, carts: c.deletedCount, orders: o.modifiedCount };
}
