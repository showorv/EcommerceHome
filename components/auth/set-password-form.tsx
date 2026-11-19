"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

/** Used by invited staff (and password resets) to choose a password from an email link. */
export function SetPasswordForm({ token, next }: { token: string; next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(form: FormData) {
    setError(null);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) {
      setError("Passwords do not match.");
      return;
    }
    start(async () => {
      const { error } = await authClient.resetPassword({ newPassword: password, token });
      if (error) {
        setError(error.message ?? "This link is invalid or has expired.");
        return;
      }
      router.replace(next);
    });
  }

  return (
    <form action={onSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
