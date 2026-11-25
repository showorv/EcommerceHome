"use client";

import { Search, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SearchBox } from "./search-box";

/**
 * Search in the store header: a box on larger screens; on phones a search button that opens the box
 * in a bar under the header. On the results page the box shows the current search.
 */
export function HeaderSearch() {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname === "/search" ? (params.get("q") ?? "") : "";
  const [open, setOpen] = useState(false);

  return (
    <>
      <SearchBox key={`d-${current}`} initialQuery={current} className="hidden w-full max-w-md md:block" />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-accent grid size-10 place-items-center rounded-full md:hidden"
        aria-label={open ? "Close search" : "Search"}
        aria-expanded={open}
        aria-controls="phone-search"
      >
        {open ? <X className="size-5" aria-hidden /> : <Search className="size-5" aria-hidden />}
      </button>
      {open && (
        <div
          id="phone-search"
          className="bg-background absolute inset-x-0 top-full border-b px-4 py-3 shadow-md md:hidden"
        >
          <SearchBox key={`m-${current}`} initialQuery={current} autoFocus onDone={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

/** Same look while the header search loads (and when JavaScript is off: it still submits). */
export function HeaderSearchFallback() {
  return (
    <form role="search" action="/search" className="relative hidden w-full max-w-md md:block">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <input
        name="q"
        type="search"
        aria-label="Search products"
        placeholder="Search products…"
        className="bg-muted/60 h-10 w-full rounded-full border pr-10 pl-9 text-sm outline-none"
      />
    </form>
  );
}
