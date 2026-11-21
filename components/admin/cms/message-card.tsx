"use client";

import { Check, Mail, Phone, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setMessageHandledAction } from "@/modules/cms/actions";
import type { ContactMessageRow } from "@/modules/cms/messages";
import { formatDhaka } from "@/modules/storefront/sections";

/** One contact message with call / email links and a "done" toggle. */
export function MessageCard({ message: m }: { message: ContactMessageRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const toggle = () =>
    start(async () => {
      const res = await setMessageHandledAction(m.id, !m.handledAt);
      if (!res.ok) return void toast.error(res.error);
      toast.success(m.handledAt ? "Moved back to “To answer”." : "Marked as done.");
      router.refresh();
    });
  return (
    <article className="bg-card grid gap-3 rounded-xl border p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <p className="font-semibold">{m.name}</p>
          <p className="text-muted-foreground text-xs">
            {formatDhaka(m.createdAt)}
            {m.page && ` · from /pages/${m.page}`}
          </p>
        </div>
        <Button size="sm" variant={m.handledAt ? "ghost" : "outline"} disabled={pending} onClick={toggle}>
          {m.handledAt ? (
            <>
              <RotateCcw className="size-4" aria-hidden /> Not done
            </>
          ) : (
            <>
              <Check className="size-4" aria-hidden /> Mark done
            </>
          )}
        </Button>
      </header>
      <p className="text-sm leading-relaxed whitespace-pre-line">{m.message}</p>
      <div className="flex flex-wrap gap-4 text-sm">
        {m.phone && (
          <a
            href={`tel:${m.phone.replace(/[^\d+]/g, "")}`}
            className="text-brand inline-flex items-center gap-1.5 hover:underline"
          >
            <Phone className="size-4" aria-hidden /> {m.phone}
          </a>
        )}
        {m.email && (
          <a
            href={`mailto:${m.email}`}
            className="text-brand inline-flex items-center gap-1.5 break-all hover:underline"
          >
            <Mail className="size-4" aria-hidden /> {m.email}
          </a>
        )}
      </div>
    </article>
  );
}
