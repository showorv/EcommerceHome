import { Suspense, type ReactNode } from "react";
import { AccountNav } from "./account-nav";

/**
 * The frame of every account page: title and tabs render at once; the part that reads the session
 * streams in behind its own boundary (Cache Components).
 */
export function AccountFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 pt-6 pb-16 md:grid-cols-[12rem_minmax(0,1fr)] md:pt-10">
      <div className="grid content-start gap-4">
        <p className="text-muted-foreground hidden text-xs font-medium tracking-wide uppercase md:block">My account</p>
        <AccountNav />
      </div>
      <div className="grid min-w-0 content-start gap-5">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>{children}</Suspense>
      </div>
    </div>
  );
}
