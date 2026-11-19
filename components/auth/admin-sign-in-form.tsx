"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

/** Staff sign-in with email + password. Repeated wrong passwords lock the account for 15 minutes. */
export function AdminSignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onPassword(form: FormData) {
    setError(null);
    start(async () => {
      const { error } = await authClient.signIn.email({
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      if (error) {
        setError(error.status === 429 ? "Too many attempts. Try again in 15 minutes." : "Wrong email or password.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    });
  }

  return (
    <form action={onPassword} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} />
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
