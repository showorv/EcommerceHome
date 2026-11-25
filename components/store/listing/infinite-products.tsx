"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { CardProduct } from "@/modules/catalog/storefront";
import { ProductGrid } from "../product-grid";

/**
 * "Load as you scroll" (FR-SF-07, admin choice). The first batch comes with the page; more load when
 * the end of the list nears. The button does the same for keyboard users and if scrolling doesn't
 * trigger it, and its link opens the next page when JavaScript is off.
 */
export function InfiniteProducts({
  initial,
  initialCursor,
  total,
  api,
  nextHref,
}: {
  initial: CardProduct[];
  initialCursor: string | null;
  total: number;
  /** `/api/listing?…` with the source and filters, without the cursor. */
  api: string;
  nextHref: string | null;
}) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  async function loadMore() {
    if (!cursor || busy.current) return;
    busy.current = true;
    setState("loading");
    try {
      const res = await fetch(`${api}&cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { products: CardProduct[]; nextCursor: string | null };
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...data.products.filter((p) => !seen.has(p.id))];
      });
      setCursor(data.nextCursor);
      setState("idle");
    } catch {
      setState("error");
    } finally {
      busy.current = false;
    }
  }

  // Start loading a little before the end of the list comes into view.
  const onNearEnd = useEffectEvent(() => void loadMore());
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor || state === "error") return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && onNearEnd(), {
      rootMargin: "800px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, state]);

  return (
    <>
      <ProductGrid products={items} className="xl:grid-cols-3" />
      <div ref={sentinel} className="mt-10 grid justify-items-center gap-3 text-center">
        <p className="text-muted-foreground text-sm" aria-live="polite">
          Showing {items.length.toLocaleString("en-IN")} of {Math.max(total, items.length).toLocaleString("en-IN")}
        </p>
        {cursor &&
          (state === "loading" ? (
            <span className="text-muted-foreground flex h-10 items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading more…
            </span>
          ) : (
            <a
              href={nextHref ?? "#"}
              onClick={(e) => {
                e.preventDefault();
                void loadMore();
              }}
              className="hover:bg-accent flex h-10 items-center rounded-md border px-5 text-sm font-medium"
            >
              {state === "error" ? "Couldn't load. Try again" : "Load more"}
            </a>
          ))}
      </div>
    </>
  );
}
