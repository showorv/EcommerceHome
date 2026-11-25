import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  activeFilterCount,
  clearFilters,
  listingSearch,
  parseListingParams,
  withSearch,
} from "@/modules/catalog/listing";
import { getListing, getListingFacets, type ListingMode, type ListingSource } from "@/modules/catalog/listing-data";
import { ProductGrid } from "../product-grid";
import { FilterPanel } from "./filter-panel";
import { InfiniteProducts } from "./infinite-products";
import { ListingProvider } from "./listing-state";
import { ListingToolbar } from "./listing-toolbar";
import { Pagination } from "./pagination";

/**
 * Filters + products for a category or collection page (FR-SF-07). It reads the URL's search
 * parameters, so the page renders it inside <Suspense>: the title and description are sent straight
 * away and the products follow in the same response.
 */
export async function ListingSection({
  source,
  basePath,
  mode,
  searchParams,
}: {
  source: ListingSource;
  basePath: string;
  mode: ListingMode;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseListingParams(await searchParams);
  const [facets, listing] = await Promise.all([getListingFacets(source), getListing(source, query)]);
  if (!facets || facets.total === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
        No products here yet. Please check back soon.
      </p>
    );
  }

  const defaultSort = facets.defaultSort;
  const filtersOnly = { ...query, page: 1 };
  const qs = listingSearch(filtersOnly).slice(1);
  const api = `/api/listing?src=${source.kind}:${source.slug}${qs ? `&${qs}` : ""}`;

  let products: ReactNode;
  if (listing.products.length === 0) {
    products = (
      <div className="grid justify-items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        {listing.total > 0 ? (
          <>
            <p className="font-medium">There are no more products on this page.</p>
            <Link
              href={withSearch(basePath, listingSearch({ ...query, page: 1 }, defaultSort))}
              className="text-sm underline"
            >
              Go to the first page
            </Link>
          </>
        ) : (
          <>
            <p className="font-medium">No products match these filters.</p>
            {activeFilterCount(query) > 0 && (
              <Link
                href={withSearch(basePath, listingSearch(clearFilters(query), defaultSort))}
                className="text-sm underline"
              >
                Clear all filters
              </Link>
            )}
          </>
        )}
      </div>
    );
  } else if (mode === "infinite") {
    products = (
      <InfiniteProducts
        key={`${qs}|${listing.sort}`} // start over when the filters change
        initial={listing.products}
        initialCursor={listing.nextCursor}
        total={listing.total}
        api={api}
        nextHref={
          listing.nextCursor
            ? withSearch(basePath, listingSearch({ ...query, page: query.page + 1 }, defaultSort))
            : null
        }
      />
    );
  } else {
    products = (
      <>
        <ProductGrid products={listing.products} className="xl:grid-cols-3" />
        <Pagination basePath={basePath} query={query} defaultSort={defaultSort} pages={listing.pages} />
      </>
    );
  }

  return (
    <ListingProvider query={query} defaultSort={defaultSort} basePath={basePath}>
      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2 pb-4">
            <FilterPanel facets={facets} idPrefix="d" />
          </div>
        </aside>
        <div className="grid min-w-0 content-start gap-6">
          <ListingToolbar facets={facets} total={listing.total} />
          <div className="transition-opacity group-data-[pending]/listing:pointer-events-none group-data-[pending]/listing:opacity-50">
            {products}
          </div>
        </div>
      </div>
    </ListingProvider>
  );
}

/** Shown for a moment while the products load. */
export function ListingSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]" aria-busy="true" aria-label="Loading products">
      <div className="hidden gap-3 lg:grid lg:content-start">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="bg-muted h-5 animate-pulse rounded" />
        ))}
      </div>
      <div className="grid content-start gap-6">
        <div className="bg-muted h-9 w-40 animate-pulse rounded" />
        <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="grid gap-2">
              <div className="bg-muted aspect-square animate-pulse rounded-lg" />
              <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
              <div className="bg-muted h-4 w-1/3 animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Title, description, picture and sub-category links at the top of a listing page. */
export function ListingHeader({
  title,
  titleBn,
  description,
  image,
  links,
}: {
  title: string;
  titleBn?: string;
  description?: string;
  image?: { url: string; alt: string };
  links?: { name: string; href: string; image?: string }[];
}) {
  return (
    <header className="mb-8 grid gap-4">
      <div className="flex items-center gap-4">
        {image?.url && (
          <Image
            src={image.url}
            alt={image.alt || ""}
            width={72}
            height={72}
            className="bg-muted size-16 shrink-0 rounded-xl object-cover md:size-[72px]"
          />
        )}
        <div className="grid gap-1">
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
          {titleBn && (
            <p lang="bn" className="text-muted-foreground">
              {titleBn}
            </p>
          )}
        </div>
      </div>
      {description && (
        <p className="text-muted-foreground max-w-3xl leading-relaxed whitespace-pre-line">{description}</p>
      )}
      {links && links.length > 0 && (
        <nav aria-label="Sub-categories">
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {links.map((l) => (
              <li key={l.href} className="shrink-0">
                <Link
                  href={l.href}
                  className="hover:border-foreground/30 hover:bg-accent flex h-10 items-center gap-2 rounded-full border pr-4 pl-1 text-sm font-medium transition-colors"
                >
                  {l.image ? (
                    <Image src={l.image} alt="" width={32} height={32} className="size-8 rounded-full object-cover" />
                  ) : (
                    <span className="bg-muted size-8 rounded-full" aria-hidden />
                  )}
                  {l.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
