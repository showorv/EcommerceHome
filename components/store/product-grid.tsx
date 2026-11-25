import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import type { CardProduct } from "@/modules/catalog/storefront";
import { ProductCard } from "./product-card";

/** Responsive grid of product cards: 2 columns on phones, 3 on tablets, 4 on wide screens. */
export function ProductGrid({
  products,
  eagerCount = 4,
  wishlist = false,
  className,
}: {
  products: CardProduct[];
  /** How many cards at the top load their image straight away (the first row is usually visible). */
  eagerCount?: number;
  /** Cards show the wishlist heart (the wishlist page). */
  wishlist?: boolean;
  className?: string;
}) {
  return (
    <Stagger className={cn("grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4", className)}>
      {products.map((p, i) => (
        <StaggerItem key={p.id} index={i} className="h-full">
          <ProductCard product={p} eager={i < eagerCount} wishlist={wishlist} />
        </StaggerItem>
      ))}
    </Stagger>
  );
}
