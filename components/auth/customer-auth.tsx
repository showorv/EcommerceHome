"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { normalizeBdPhone } from "@/lib/phone";
import { reloadCart } from "@/components/store/cart/cart-store";

function GoogleButton({ enabled }: { enabled: boolean }) {
  const [pending, start] = useTransition();
  if (!enabled) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => void (await authClient.signIn.social({ provider: "google", callbackURL: "/account" })))
        }
      >
        Continue with Google
      </Button>
      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <span className="bg-border h-px flex-1" /> or <span className="bg-border h-px flex-1" />
      </div>
    </>
  );
}

/** Sign in with email or BD phone number + password (FR-AC-03). */
export function CustomerSignInForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(form: FormData) {
    setError(null);
    const id = String(form.get("identifier") ?? "").trim();
    const password = String(form.get("password") ?? "");
    start(async () => {
      const phone = normalizeBdPhone(id);
      const { error } = phone
        ? await authClient.signIn.phoneNumber({ phoneNumber: phone, password })
        : await authClient.signIn.email({ email: id, password });
      if (error) {
        setError(
          error.status === 429 ? "Too many attempts. Try again in 15 minutes." : "Wrong email/phone or password.",
        );
        return;
      }
      // A guest cart joins the account's cart now (FR-CO-01).
      void reloadCart();
      router.replace("/account");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <GoogleButton enabled={googleEnabled} />
      <form action={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="identifier">Email or mobile number</Label>
          <Input
            id="identifier"
            name="identifier"
            autoComplete="username"
            required
            placeholder="you@example.com or 017XXXXXXXX"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
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
      <p className="text-muted-foreground text-center text-sm">
        New here?{" "}
        <Link href="/account/sign-up" className="text-foreground font-medium underline-offset-2 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

/** Sign up with name, email and password (FR-AC-02). Phone is added and OTP-verified at checkout. */
export function CustomerSignUpForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(form: FormData) {
    setError(null);
    const email = String(form.get("email") ?? "").trim();
    start(async () => {
      const { error } = await authClient.signUp.email({
        name: String(form.get("name") ?? "").trim(),
        email,
        password: String(form.get("password") ?? ""),
        callbackURL: "/account",
      });
      if (error) {
        setError(error.message ?? "Could not create the account.");
        return;
      }
      setSentTo(email);
    });
  }

  if (sentTo) {
    return (
      <p className="text-sm">
        Check <strong>{sentTo}</strong> for a link to verify your email. You can keep shopping in the meantime.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <GoogleButton enabled={googleEnabled} />
      <form action={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" name="name" autoComplete="name" required minLength={2} maxLength={80} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
          <p className="text-muted-foreground text-xs">At least 8 characters.</p>
        </div>
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </Button>
      </form>
      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link href="/account/sign-in" className="text-foreground font-medium underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
