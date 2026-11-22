import type { Metadata } from "next";
import Link from "next/link";
import { CustomerSignOutButton } from "@/components/auth/customer-sign-out";
import { AccountFrame } from "@/components/store/account/account-frame";
import { OrderList } from "@/components/store/account/order-list";
import { Button } from "@/components/ui/button";
import { myOrders, requireCustomer } from "@/modules/account/data";

export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };

/** Account overview (FR-AC-06): who you are and your latest orders. */
export default function AccountPage() {
  return (
    <AccountFrame title="My account">
      <Overview />
    </AccountFrame>
  );
}

const local = (p: string) => p.replace(/^\+88/, "");

async function Overview() {
  const c = await requireCustomer("/account");
  const orders = await myOrders(c, 3);
  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4 sm:p-5">
        <div className="grid min-w-0 gap-1 text-sm">
          <p className="text-base font-semibold">{c.name}</p>
          {c.email && (
            <p className="text-muted-foreground [overflow-wrap:anywhere]">
              {c.email}{" "}
              <span className="whitespace-nowrap">{c.emailVerified ? "· confirmed" : "· not confirmed yet"}</span>
            </p>
          )}
          {c.phoneNumber && (
            <p className="text-muted-foreground">
              {local(c.phoneNumber)} {c.phoneNumberVerified ? "· confirmed" : "· not confirmed yet"}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/account/profile">Edit profile</Link>
          </Button>
          <CustomerSignOutButton />
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="recent-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="recent-title" className="text-lg font-semibold">
            Recent orders
          </h2>
          {orders.length > 0 && (
            <Link href="/account/orders" className="text-sm underline underline-offset-4">
              See all
            </Link>
          )}
        </div>
        {orders.length > 0 ? (
          <OrderList rows={orders} />
        ) : (
          <div className="text-muted-foreground grid justify-items-start gap-3 rounded-lg border border-dashed p-5 text-sm">
            <p>You haven&apos;t ordered anything yet.</p>
            <Button asChild size="sm">
              <Link href="/">Start shopping</Link>
            </Button>
          </div>
        )}
        {!c.phoneNumberVerified && (
          <p className="text-muted-foreground text-xs">
            Ordered without signing in? Those orders show here once you{" "}
            <Link href="/account/profile" className="underline underline-offset-2">
              add your mobile number
            </Link>{" "}
            and confirm it with a code. Until then you can{" "}
            <Link href="/track" className="underline underline-offset-2">
              track an order
            </Link>{" "}
            by its number.
          </p>
        )}
      </section>
    </div>
  );
}
