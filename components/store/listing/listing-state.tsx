"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useOptimistic, useTransition, type ReactNode } from "react";
import { listingSearch, withSearch, type ListingQuery, type ListingSort } from "@/modules/catalog/listing";

/**
 * Filters live in the URL, so a filtered page can be shared, bookmarked and opened with Back.
 * Changing a filter updates the controls at once (optimistic) and the products follow when the
 * server answers; meanwhile the list is dimmed (`data-pending` on the wrapper).
 */

type ListingState = {
  query: ListingQuery;
  defaultSort: ListingSort;
  basePath: string;
  pending: boolean;
  /** Go to these filters (back to page 1 unless `keepPage`). */
  apply: (next: ListingQuery, opts?: { keepPage?: boolean }) => void;
  href: (q: ListingQuery) => string;
};

const Ctx = createContext<ListingState | null>(null);

export function useListing(): ListingState {
  const v = use(Ctx);
  if (!v) throw new Error("useListing needs <ListingProvider>");
  return v;
}

export function ListingProvider({
  query,
  defaultSort,
  basePath,
  children,
}: {
  query: ListingQuery;
  defaultSort: ListingSort;
  basePath: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(query);
  const href = (q: ListingQuery) => withSearch(basePath, listingSearch(q, defaultSort));

  function apply(next: ListingQuery, opts?: { keepPage?: boolean }) {
    const q = opts?.keepPage ? next : { ...next, page: 1 };
    startTransition(() => {
      setOptimistic(q);
      router.push(href(q), { scroll: false });
    });
  }

  return (
    <Ctx value={{ query: optimistic, defaultSort, basePath, pending, apply, href }}>
      <div data-pending={pending ? "" : undefined} className="group/listing">
        {children}
      </div>
    </Ctx>
  );
}
