import { ChevronRight } from "lucide-react";
import Link from "next/link";

/** "Home › Kitchen › Choppers": every step is a link except the current page. */
export function Breadcrumbs({ crumbs }: { crumbs: { name: string; path: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-muted-foreground mb-4 text-sm">
      <ol className="flex flex-wrap items-center gap-1">
        {crumbs.map((c, i) => (
          <li key={c.path} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
            {i < crumbs.length - 1 ? (
              <Link href={c.path} className="hover:text-foreground hover:underline">
                {c.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground truncate">
                {c.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
