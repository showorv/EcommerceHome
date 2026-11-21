import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CustomerSignOutButton } from "@/components/auth/customer-sign-out";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/modules/auth/session";

export const metadata = { title: "My account" };

/** Account area shell. Orders, addresses and wishlist arrive in Phase 2 (FR-AC-06). */
export default function AccountPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">My account</h1>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <AccountDetails />
      </Suspense>
    </div>
  );
}

async function AccountDetails() {
  const session = await getSession();
  if (!session) redirect("/account/sign-in");
  const { user } = session;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{user.name}</CardTitle>
        <CardDescription>
          {user.email} {user.emailVerified ? "· verified" : "· not verified yet"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">Order history, saved addresses and wishlist are coming soon.</p>
        <CustomerSignOutButton />
      </CardContent>
    </Card>
  );
}
