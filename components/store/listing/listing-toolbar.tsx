"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { activeFilterCount, SORT_LABELS, type ListingSort } from "@/modules/catalog/listing";
import type { ListingFacets } from "@/modules/catalog/listing-data";
import { ActiveFilters, FilterPanel } from "./filter-panel";
import { useListing } from "./listing-state";

/** Result count, sort menu and (on phones) the "Filters" button that opens the filters as a sheet. */
export function ListingToolbar({ facets, total }: { facets: ListingFacets; total: number }) {
  const { query: q, apply, pending, defaultSort } = useListing();
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(q);
  const sort = q.sort ?? defaultSort;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm" aria-live="polite" aria-busy={pending}>
          {pending ? "Updating…" : `${total.toLocaleString("en-IN")} ${total === 1 ? "product" : "products"}`}
        </p>
        <div className="flex items-center gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 lg:hidden">
                <SlidersHorizontal className="size-4" aria-hidden />
                Filters
                {count > 0 && (
                  <span className="bg-primary text-primary-foreground grid size-5 place-items-center rounded-full text-xs">
                    {count}
                  </span>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="top-auto bottom-0 left-0 max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 grid-rows-[auto_1fr_auto] gap-0 overflow-hidden rounded-none rounded-t-2xl p-0 sm:max-w-none">
              <div className="border-b px-5 py-4">
                <DialogTitle>Filters</DialogTitle>
                <DialogDescription className="sr-only">Changes apply straight away.</DialogDescription>
              </div>
              <div className="overflow-y-auto px-5 py-4">
                <FilterPanel facets={facets} idPrefix="m" />
              </div>
              <div className="border-t px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <Button className="w-full" onClick={() => setOpen(false)}>
                  {pending
                    ? "Updating…"
                    : `Show ${total.toLocaleString("en-IN")} ${total === 1 ? "product" : "products"}`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <label htmlFor="listing-sort" className="text-muted-foreground hidden text-sm sm:inline">
            Sort by
          </label>
          <select
            id="listing-sort"
            value={sort}
            onChange={(e) => apply({ ...q, sort: e.target.value as ListingSort })}
            className="bg-background focus-visible:ring-ring/50 h-9 rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
            aria-label="Sort products"
          >
            {facets.sorts.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ActiveFilters facets={facets} />
    </div>
  );
}
