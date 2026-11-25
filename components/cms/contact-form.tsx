"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useActionState, useId } from "react";
import { cn } from "@/lib/utils";
import { sendContactAction, type ContactState } from "@/modules/cms/actions";

const INITIAL: ContactState = { status: "idle", message: "" };

const field =
  "bg-background focus-visible:ring-ring/50 aria-invalid:border-destructive w-full rounded-xl border px-3.5 text-sm outline-none focus-visible:ring-[3px]";

/** Contact page form (works without JavaScript too: the form posts to the server action). */
export function ContactForm({ page }: { page: string }) {
  const [state, action, pending] = useActionState(sendContactAction, INITIAL);
  const id = useId();

  if (state.status === "ok") {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium">
        <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden />
        {state.message}
      </p>
    );
  }

  const err = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const describe = (name: keyof typeof err) => (err[name] ? `${id}-${name}-error` : undefined);
  const error = (name: keyof typeof err) =>
    err[name] ? (
      <p id={`${id}-${name}-error`} className="text-destructive text-xs">
        {err[name]}
      </p>
    ) : null;

  return (
    // key: a failed send re-mounts the inputs with what the shopper typed.
    <form action={action} className="grid gap-4" noValidate key={JSON.stringify(v)}>
      <input type="hidden" name="page" value={page} />
      {/* Hidden from people; bots fill it in. */}
      <input name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Your name
        </label>
        <input
          id={`${id}-name`}
          name="name"
          required
          maxLength={80}
          autoComplete="name"
          defaultValue={v.name}
          aria-invalid={Boolean(err.name) || undefined}
          aria-describedby={describe("name")}
          className={cn(field, "h-11")}
        />
        {error("name")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <label htmlFor={`${id}-phone`} className="text-sm font-medium">
            Mobile number
          </label>
          <input
            id={`${id}-phone`}
            name="phone"
            type="tel"
            inputMode="tel"
            maxLength={20}
            autoComplete="tel"
            placeholder="01XXXXXXXXX"
            defaultValue={v.phone}
            aria-invalid={Boolean(err.phone) || undefined}
            aria-describedby={describe("phone")}
            className={cn(field, "h-11")}
          />
          {error("phone")}
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor={`${id}-email`} className="text-sm font-medium">
            Email <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            maxLength={254}
            autoComplete="email"
            defaultValue={v.email}
            aria-invalid={Boolean(err.email) || undefined}
            aria-describedby={describe("email")}
            className={cn(field, "h-11")}
          />
          {error("email")}
        </div>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-message`} className="text-sm font-medium">
          Message
        </label>
        <textarea
          id={`${id}-message`}
          name="message"
          required
          rows={5}
          maxLength={2000}
          defaultValue={v.message}
          aria-invalid={Boolean(err.message) || undefined}
          aria-describedby={describe("message")}
          className={cn(field, "py-2.5")}
        />
        {error("message")}
      </div>
      {state.status === "error" && !Object.keys(err).length && (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      )}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="bg-brand text-brand-foreground hover:bg-brand/90 inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold disabled:opacity-70"
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Send message
        </button>
      </div>
    </form>
  );
}
