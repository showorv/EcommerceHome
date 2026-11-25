"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { forgetCart } from "@/components/store/cart/cart-store";
import { forgetCheckoutDraft } from "@/components/store/checkout/draft";
import { forgetWishlist } from "@/components/store/wishlist-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { normalizeBdPhone } from "@/lib/phone";

const local = (p: string) => p.replace(/^\+88/, "");

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 rounded-lg border p-4 sm:p-5">
      <div className="grid gap-0.5">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Messages Better Auth sends back, in the shop's words. */
function authError(
  e: { code?: string; message?: string; status?: number } | null | undefined,
  fallback: string,
): string {
  if (e?.status === 429) return "Too many tries. Please wait a few minutes and try again.";
  switch (e?.code) {
    case "INVALID_PASSWORD":
      return "That password isn't right.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 8 characters.";
    case "PASSWORD_TOO_LONG":
      return "Use at most 128 characters.";
    case "SESSION_EXPIRED":
      return "For your safety, please sign out, sign in again and then delete within a day.";
    case "PASSWORD_COMPROMISED":
      return "This password has appeared in a data leak. Please choose another.";
    case "INVALID_OTP":
      return "That code isn't right.";
    case "OTP_EXPIRED":
    case "OTP_NOT_FOUND":
      return "That code has expired. Send a new one.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many wrong codes. Send a new one.";
    case "PHONE_NUMBER_EXIST":
      return "This number is already on another account. Please contact us if it's yours.";
    default:
      return e?.message || fallback;
  }
}

export function ProfileForms(p: {
  name: string;
  email: string;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  hasPassword: boolean;
  google: boolean;
  devices: number;
  isStaff: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(p.name);
  const [pw, setPw] = useState({ current: "", next: "", signOutOthers: true });
  const [del, setDel] = useState({ open: false, password: "", confirm: false });

  function saveName() {
    const n = name.trim();
    if (n.length < 2 || n.length > 80) {
      toast.error("Enter your name (2–80 characters).");
      return;
    }
    start(async () => {
      const { error } = await authClient.updateUser({ name: n });
      if (error) toast.error(authError(error, "Couldn't save your name."));
      else {
        toast.success("Name saved.");
        router.refresh();
      }
    });
  }

  function changePassword() {
    if (pw.next.length < 8) {
      toast.error("Use at least 8 characters for the new password.");
      return;
    }
    start(async () => {
      const { error } = await authClient.changePassword({
        currentPassword: pw.current,
        newPassword: pw.next,
        revokeOtherSessions: pw.signOutOthers,
      });
      if (error) toast.error(authError(error, "Couldn't change your password."));
      else {
        toast.success(pw.signOutOthers ? "Password changed. Other devices are signed out." : "Password changed.");
        setPw({ current: "", next: "", signOutOthers: true });
        router.refresh();
      }
    });
  }

  function signOutOthers() {
    start(async () => {
      const { error } = await authClient.revokeOtherSessions();
      if (error) toast.error(authError(error, "Couldn't sign out the other devices."));
      else {
        toast.success("Signed out everywhere else.");
        router.refresh();
      }
    });
  }

  function deleteAccount() {
    start(async () => {
      const { error } = await authClient.deleteUser(p.hasPassword ? { password: del.password } : {});
      if (error) {
        toast.error(authError(error, "Couldn't delete your account."));
        return;
      }
      forgetCart();
      forgetWishlist();
      forgetCheckoutDraft();
      toast.success("Your account was deleted.");
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <Section title="Your details">
        <div className="grid gap-1.5 sm:max-w-sm">
          <Label htmlFor="pf-name">Name</Label>
          <div className="flex gap-2">
            <Input
              id="pf-name"
              autoComplete="name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button variant="outline" disabled={pending || name.trim() === p.name} onClick={saveName}>
              Save
            </Button>
          </div>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
          {p.email && (
            <>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="[overflow-wrap:anywhere]">
                {p.email}{" "}
                <span className="text-muted-foreground whitespace-nowrap">
                  {p.emailVerified ? "· confirmed" : "· not confirmed yet"}
                </span>
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">Sign-in</dt>
          <dd>{[p.hasPassword && "Password", p.google && "Google"].filter(Boolean).join(" and ") || "—"}</dd>
        </dl>
        <p className="text-muted-foreground text-xs">To change your email address, please contact us.</p>
      </Section>

      <MobileSection phone={p.phone} verified={p.phoneVerified} />

      {p.hasPassword && (
        <Section title="Password">
          <div className="grid gap-3 sm:max-w-sm">
            <div className="grid gap-1.5">
              <Label htmlFor="pf-current">Current password</Label>
              <Input
                id="pf-current"
                type="password"
                autoComplete="current-password"
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-new">New password</Label>
              <Input
                id="pf-new"
                type="password"
                autoComplete="new-password"
                maxLength={128}
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
              />
              <p className="text-muted-foreground text-xs">At least 8 characters.</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={pw.signOutOthers}
                onChange={(e) => setPw({ ...pw, signOutOthers: e.target.checked })}
              />
              Sign out my other devices
            </label>
            <Button className="w-fit" disabled={pending || !pw.current || !pw.next} onClick={changePassword}>
              Change password
            </Button>
          </div>
        </Section>
      )}

      <Section
        title="Devices"
        description={
          p.devices > 1
            ? `You're signed in on ${p.devices} devices or browsers, including this one.`
            : "You're signed in on this device only."
        }
      >
        <Button variant="outline" className="w-fit" disabled={pending || p.devices <= 1} onClick={signOutOthers}>
          Sign out of all other devices
        </Button>
      </Section>

      <Section
        title="Delete account"
        description="Your saved addresses, wishlist and cart are deleted, and you're signed out everywhere. Your past orders stay in our records (we need them for deliveries, returns and our accounts), but they're no longer linked to you."
      >
        {p.isStaff ? (
          <p className="text-muted-foreground text-sm">Staff accounts are removed by an owner in Admin → Staff.</p>
        ) : !del.open ? (
          <Button variant="outline" className="text-destructive w-fit" onClick={() => setDel({ ...del, open: true })}>
            Delete my account…
          </Button>
        ) : (
          <div className="border-destructive/40 bg-destructive/5 grid gap-3 rounded-md border p-3 sm:max-w-md">
            {p.hasPassword ? (
              <div className="grid gap-1.5">
                <Label htmlFor="pf-del">Enter your password to confirm</Label>
                <Input
                  id="pf-del"
                  type="password"
                  autoComplete="current-password"
                  value={del.password}
                  onChange={(e) => setDel({ ...del, password: e.target.value })}
                />
              </div>
            ) : (
              <p className="text-sm">You sign in with Google, so this works within a day of your last sign-in.</p>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={del.confirm}
                onChange={(e) => setDel({ ...del, confirm: e.target.checked })}
              />
              I understand this can&apos;t be undone.
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                disabled={pending || !del.confirm || (p.hasPassword && !del.password)}
                onClick={deleteAccount}
              >
                {pending ? "Deleting…" : "Delete my account"}
              </Button>
              <Button variant="ghost" onClick={() => setDel({ open: false, password: "", confirm: false })}>
                Keep my account
              </Button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

/**
 * Add or change the account's mobile number, confirmed with an SMS code. A confirmed number also
 * brings orders placed without signing in into "My orders".
 */
function MobileSection({ phone, verified }: { phone: string | null; verified: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");

  function reset() {
    setOpen(false);
    setTyped("");
    setSentTo(null);
    setCode("");
  }

  function sendCode() {
    const number = normalizeBdPhone(typed);
    if (!number) {
      toast.error("Enter a Bangladeshi mobile number, like 01712345678.");
      return;
    }
    if (number === phone && verified) {
      toast.error("That's already your confirmed number.");
      return;
    }
    start(async () => {
      const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: number });
      if (error) toast.error(authError(error, "Couldn't send the code."));
      else {
        setSentTo(number);
        setCode("");
        toast.success(`Code sent to ${local(number)}.`);
      }
    });
  }

  function confirm() {
    if (!sentTo || !/^\d{6}$/.test(code)) {
      toast.error("Enter the 6-digit code.");
      return;
    }
    start(async () => {
      const { error } = await authClient.phoneNumber.verify({ phoneNumber: sentTo, code, updatePhoneNumber: true });
      if (error) toast.error(authError(error, "Couldn't confirm the number."));
      else {
        toast.success("Mobile number confirmed.");
        reset();
        router.refresh();
      }
    });
  }

  return (
    <Section
      title="Mobile number"
      description={
        phone && verified
          ? `${local(phone)} is confirmed. Orders placed with it, even without signing in, show in My orders.`
          : "Add your mobile number and confirm it with a code. Orders you placed with it, even without signing in, then show in My orders."
      }
    >
      {!open ? (
        <Button variant="outline" className="w-fit" onClick={() => setOpen(true)}>
          {phone && verified ? "Change mobile number" : "Add mobile number"}
        </Button>
      ) : (
        <div className="grid gap-3 sm:max-w-sm">
          <div className="grid gap-1.5">
            <Label htmlFor="pf-phone">Mobile number</Label>
            <div className="flex gap-2">
              <Input
                id="pf-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="01XXXXXXXXX"
                maxLength={16}
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  setSentTo(null);
                }}
              />
              <Button variant="outline" disabled={pending || !typed.trim()} onClick={sendCode}>
                {sentTo ? "Resend" : "Send code"}
              </Button>
            </div>
          </div>
          {sentTo && (
            <div className="grid gap-1.5">
              <Label htmlFor="pf-code">Code from the SMS</Label>
              <Input
                id="pf-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
              <p className="text-muted-foreground text-xs">It expires in 5 minutes.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {sentTo && (
              <Button disabled={pending || code.length !== 6} onClick={confirm}>
                Confirm number
              </Button>
            )}
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}
