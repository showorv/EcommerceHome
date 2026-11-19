"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ to = "/admin/sign-in" }: { to?: string }) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        router.replace(to);
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
