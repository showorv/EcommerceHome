"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProductCard } from "@/components/store/product-card";
import type { CardProduct } from "@/modules/catalog/storefront";

/**
 * A row of product cards that scrolls sideways: swipe on phones, arrow buttons on desktop.
 * Uses native scrolling with snap points, so it stays smooth and works without JavaScript.
 */
export function ProductRail({ products, label }: { products: CardProduct[]; label: string }) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () =>
      setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const scroll = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

  return (
    <div className="group/rail relative">
      <ul
        ref={track}
        aria-label={label}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-2 sm:gap-4 [&::-webkit-scrollbar]:hidden"
      >
        {products.map((p, i) => (
          <li key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[calc(25%-0.75rem)]">
            <ProductCard product={p} eager={i < 2} />
          </li>
        ))}
      </ul>
      {!edges.start && (
        <button
          type="button"
          onClick={() => scroll(-1)}
          className="bg-background/90 absolute top-[35%] -left-3 z-10 hidden size-10 place-items-center rounded-full border shadow-md backdrop-blur md:grid"
          aria-label="Scroll back"
        >
          <ChevronLeft className="size-5" />
        </button>
      )}
      {!edges.end && (
        <button
          type="button"
          onClick={() => scroll(1)}
          className="bg-background/90 absolute top-[35%] -right-3 z-10 hidden size-10 place-items-center rounded-full border shadow-md backdrop-blur md:grid"
          aria-label="Scroll forward"
        >
          <ChevronRight className="size-5" />
        </button>
      )}
    </div>
  );
}
