import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ListingSection, ListingSkeleton } from "@/components/store/listing/listing-section";
import { SearchBox } from "@/components/store/search-box";
import { getCategoryTree } from "@/modules/catalog/category-tree";
import { cleanQuery } from "@/modules/catalog/search";
import { getSuggestions, searchProductIds } from "@/modules/catalog/search-data";

/**
 * Search results (FR-SF-08): best matches first, with the same filters, sorting and pages as category
 * pages. Typos are forgiven ("chpper" finds "chopper"). Results pages are kept out of search engines.
 */

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: true },
};

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 pb-16">
      <Suspense
        fallback={
          <>
            <div className="bg-muted mb-8 h-9 w-64 animate-pulse rounded" />
            <ListingSkeleton />
          </>
        }
      >
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SearchResults({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const q = cleanQuery(raw ?? "");

  if (!q) {
    return (
      <div className="grid max-w-xl gap-6">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Search</h1>
        <SearchBox autoFocus />
        <CategoryLinks title="Or browse a category" slugs={null} />
      </div>
    );
  }

  const ids = await searchProductIds(q);
  if (ids.length === 0) {
    const { categories } = await getSuggestions(q);
    return (
      <div className="grid max-w-xl gap-6">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
          No results for <span className="text-brand">“{q}”</span>
        </h1>
        <p className="text-muted-foreground">
          Check the spelling, try fewer or more general words (e.g. “blender” instead of “mini juice blender 500ml”), or
          search in Bangla or English.
        </p>
        <SearchBox initialQuery={q} />
        <CategoryLinks
          title={categories.length ? "Did you mean" : "Browse a category"}
          slugs={categories.length ? categories.map((c) => c.slug) : null}
        />
      </div>
    );
  }

  return (
    <>
      <header className="mb-8 grid gap-1">
        <p className="text-muted-foreground text-sm">Search results</p>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">“{q}”</h1>
      </header>
      <ListingSection
        source={{ kind: "search", slug: q }}
        basePath={`/search?q=${encodeURIComponent(q)}`}
        mode="pagination"
        searchParams={searchParams}
      />
    </>
  );
}

/** Links to the given categories, or to the top-level ones when `slugs` is null. */
async function CategoryLinks({ title, slugs }: { title: string; slugs: string[] | null }) {
  const tree = (await getCategoryTree()).filter((c) => c.active);
  const list = slugs
    ? slugs.map((s) => tree.find((c) => c.slug === s)).filter((c) => c !== undefined)
    : tree.filter((c) => !c.parentId);
  if (list.length === 0) return null;
  return (
    <nav aria-label={title} className="grid gap-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="flex flex-wrap gap-2">
        {list.slice(0, 12).map((c) => (
          <li key={c.slug}>
            <Link
              href={`/c/${c.slug}`}
              className="hover:bg-accent flex h-9 items-center rounded-full border px-4 text-sm font-medium"
            >
              {c.name.en}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
