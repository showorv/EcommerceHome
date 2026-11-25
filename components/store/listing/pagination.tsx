import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { listingSearch, pageWindow, withSearch, type ListingQuery, type ListingSort } from "@/modules/catalog/listing";

/** Numbered pages (plain links, so they work without JavaScript and search engines can follow them). */
export function Pagination({
  basePath,
  query,
  defaultSort,
  pages,
}: {
  basePath: string;
  query: ListingQuery;
  defaultSort: ListingSort;
  pages: number;
}) {
  if (pages <= 1) return null;
  const page = Math.min(query.page, pages);
  const href = (p: number) => withSearch(basePath, listingSearch({ ...query, page: p }, defaultSort));
  const arrow = "flex h-10 items-center gap-1 rounded-md border px-3 text-sm";

  return (
    <nav aria-label="Pages" className="mt-10 flex flex-wrap items-center justify-center gap-1">
      {page > 1 ? (
        <Link href={href(page - 1)} className={cn(arrow, "hover:bg-accent")} rel="prev">
          <ChevronLeft className="size-4" aria-hidden />
          Previous
        </Link>
      ) : (
        <span className={cn(arrow, "text-muted-foreground opacity-50")} aria-hidden>
          <ChevronLeft className="size-4" />
          Previous
        </span>
      )}
      <ol className="flex items-center gap-1">
        {pageWindow(page, pages).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} className="text-muted-foreground px-1" aria-hidden>
              …
            </li>
          ) : (
            <li key={p} className={cn(Math.abs(p - page) > 1 && p !== 1 && p !== pages && "hidden sm:block")}>
              <Link
                href={href(p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                className={cn(
                  "grid h-10 min-w-10 place-items-center rounded-md px-2 text-sm tabular-nums",
                  p === page ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-accent",
                )}
              >
                {p}
              </Link>
            </li>
          ),
        )}
      </ol>
      {page < pages ? (
        <Link href={href(page + 1)} className={cn(arrow, "hover:bg-accent")} rel="next">
          Next
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span className={cn(arrow, "text-muted-foreground opacity-50")} aria-hidden>
          Next
          <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  );
}
