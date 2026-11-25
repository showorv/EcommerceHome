"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { cn } from "@/lib/utils";
import { subscribeAction, type SubscribeState } from "@/modules/storefront/actions";

const INITIAL: SubscribeState = { status: "idle", message: "" };

/** Email sign-up (works without JavaScript too: the form posts to the server action). */
export function NewsletterForm({ buttonLabel, note }: { buttonLabel: string; note: string }) {
  const [state, action, pending] = useActionState(subscribeAction, INITIAL);
  if (state.status === "ok") {
    return (
      <p role="status" className="text-brand rounded-full border px-5 py-3 text-sm font-medium">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="grid w-full max-w-md gap-2">
      <div className="flex gap-2">
        <label htmlFor="newsletter-email" className="sr-only">
          Email address
        </label>
        <input
          id="newsletter-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
          placeholder="you@example.com"
          aria-invalid={state.status === "error" || undefined}
          aria-describedby="newsletter-msg"
          className="bg-background focus-visible:ring-ring/50 h-11 min-w-0 flex-1 rounded-full border px-4 text-sm outline-none focus-visible:ring-[3px]"
        />
        {/* Hidden from people; bots fill it in. */}
        <input name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        <button
          type="submit"
          disabled={pending}
          className="bg-brand text-brand-foreground hover:bg-brand/90 inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-70"
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {buttonLabel || "Subscribe"}
        </button>
      </div>
      <p
        id="newsletter-msg"
        role={state.status === "error" ? "alert" : undefined}
        className={cn("text-xs", state.status === "error" ? "text-destructive" : "text-muted-foreground")}
      >
        {state.status === "error" ? state.message : note}
      </p>
    </form>
  );
}
