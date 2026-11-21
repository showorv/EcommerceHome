"use client";

import { MessageSquareText } from "lucide-react";
import { useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { sendCheckoutCodeAction, verifyCheckoutCodeAction } from "@/modules/checkout/actions";
import { normalizeCode, OTP } from "@/modules/otp/rules";

/**
 * The phone code step of checkout (FR-CO-03). The checkout page sends the first code before opening
 * this, and passes in how that went.
 */

export type CodeSent =
  { ok: true; resendIn: number } | { ok: false; error: string; retryAfter?: number; cooldown?: true };

function subscribeSecond(onChange: () => void) {
  const t = setInterval(onChange, 1_000);
  return () => clearInterval(t);
}
const currentSecond = () => Math.floor(Date.now() / 1000);
const useSecondClock = () => useSyncExternalStore(subscribeSecond, currentSecond, () => 0);

/** 01712-345678, for showing the number the code went to. */
const showPhone = (p: string) => {
  const local = p.replace(/^\+88/, "");
  return /^01\d{9}$/.test(local) ? `${local.slice(0, 5)}-${local.slice(5)}` : p;
};

export function PhoneCodeDialog({
  phone,
  sent,
  sentAt,
  onVerified,
  onChangeNumber,
  onClose,
}: {
  phone: string;
  sent: CodeSent;
  /** Second the first send was answered (from the event that opened this). */
  sentAt: number;
  onVerified: () => void;
  onChangeNumber: () => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "info" | "error"; text: string } | null>(
    sent.ok ? null : { kind: sent.cooldown ? "info" : "error", text: sent.error },
  );
  const [resendAt, setResendAt] = useState(sentAt + (sent.ok ? sent.resendIn : (sent.retryAfter ?? 0)));
  const [checking, startCheck] = useTransition();
  const [sending, startSend] = useTransition();
  const now = useSecondClock();
  const wait = Math.max(0, resendAt - now);

  function check(value: string) {
    const c = normalizeCode(value);
    if (!c) {
      setMessage({ kind: "error", text: `Enter the ${OTP.length}-digit code from the SMS.` });
      return;
    }
    startCheck(async () => {
      const res = await verifyCheckoutCodeAction(phone, c).catch(() => null);
      if (!res) {
        setMessage({ kind: "error", text: "Couldn't reach the store. Check your connection and try again." });
        return;
      }
      if (res.ok) {
        onVerified();
        return;
      }
      setMessage({ kind: "error", text: res.error });
      if (res.expired) setCode("");
    });
  }

  function resend() {
    startSend(async () => {
      const res = await sendCheckoutCodeAction(phone).catch(() => null);
      const at = Math.floor(Date.now() / 1000);
      if (!res) {
        setMessage({ kind: "error", text: "Couldn't reach the store. Check your connection and try again." });
        return;
      }
      if (res.ok && res.verified) {
        onVerified();
        return;
      }
      if (res.ok) {
        setCode("");
        setResendAt(at + res.resendIn);
        setMessage({ kind: "ok", text: "We sent a new code. Only the newest code works." });
        return;
      }
      if (res.retryAfter) setResendAt(at + res.retryAfter);
      setMessage({ kind: "error", text: res.error });
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            check(code);
          }}
        >
          <DialogHeader>
            <div className="bg-brand/10 text-brand mx-auto mb-1 grid size-10 place-items-center rounded-full sm:mx-0">
              <MessageSquareText className="size-5" aria-hidden />
            </div>
            <DialogTitle>Confirm your mobile number</DialogTitle>
            <DialogDescription>
              {sent.ok ? "We texted a 6-digit code to " : "Enter the code we texted to "}
              <span className="text-foreground font-medium tabular-nums">{showPhone(phone)}</span>. It works for{" "}
              {OTP.ttlSeconds / 60} minutes.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <label htmlFor="co-otp" className="text-sm font-medium">
              Code
            </label>
            <Input
              id="co-otp"
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              maxLength={OTP.length + 2}
              value={code}
              disabled={checking}
              aria-invalid={message?.kind === "error" ? true : undefined}
              aria-describedby={message ? "co-otp-message" : undefined}
              className="h-12 text-center text-2xl tracking-[0.5em] tabular-nums"
              onChange={(e) => {
                const value = e.target.value;
                setCode(value);
                setMessage(null);
                // All six digits typed or pasted: check right away.
                if (normalizeCode(value) && !checking) check(value);
              }}
            />
            {message && (
              <p
                id="co-otp-message"
                role={message.kind === "error" ? "alert" : "status"}
                className={cn(
                  "text-sm",
                  message.kind === "error" && "text-destructive",
                  message.kind === "ok" && "text-success",
                  message.kind === "info" && "text-muted-foreground",
                )}
              >
                {message.text}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Button
              type="submit"
              size="lg"
              className="bg-brand text-brand-foreground hover:bg-brand/90 w-full"
              disabled={checking}
            >
              {checking ? "Checking…" : "Confirm and continue"}
            </Button>
            <div className="flex items-center justify-between gap-2 text-sm">
              <Button type="button" variant="link" className="h-auto px-0" onClick={onChangeNumber}>
                Change number
              </Button>
              <Button
                type="button"
                variant="link"
                className="h-auto px-0 tabular-nums"
                disabled={wait > 0 || sending}
                onClick={resend}
              >
                {sending
                  ? "Sending…"
                  : wait > 0
                    ? `Send a new code in ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, "0")}`
                    : "Send a new code"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
