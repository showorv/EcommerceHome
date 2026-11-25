import type { Metadata } from "next";
import Link from "next/link";
import { AccountFrame } from "@/components/store/account/account-frame";
import { OrderList } from "@/components/store/account/order-list";
import { Button } from "@/components/ui/button";
import { myOrders, ORDER_LIST_LIMIT, requireCustomer } from "@/modules/account/data";

export const metadata: Metadata = { title: "My orders", robots: { index: false, follow: false } };

/** Order history (FR-AC-06). */
export default function OrdersPage() {
  return (
    <AccountFrame title="My orders">
      <Orders />
    </AccountFrame>
  );
}

async function Orders() {
  const c = await requireCustomer("/account/orders");
  const rows = await myOrders(c);
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground grid justify-items-start gap-3 rounded-lg border border-dashed p-5 text-sm">
        <p>No orders yet.</p>
        <Button asChild size="sm">
          <Link href="/">Start shopping</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <OrderList rows={rows} />
      {rows.length >= ORDER_LIST_LIMIT && (
        <p className="text-muted-foreground text-xs">Showing your latest {ORDER_LIST_LIMIT} orders.</p>
      )}
    </div>
  );
}
