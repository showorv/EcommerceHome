import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import type { CardProduct } from "@/modules/catalog/storefront";
import { ProductCard } from "./product-card";

/** Responsive grid of product cards: 2 columns on phones, up to 4 on desktop. */
export function ProductGrid({
  products,
  eagerCount = 4,
  className,
}: {
  products: CardProduct[];
  /** How many cards at the top load their image straight away (the first row is usually visible). */
  eagerCount?: number;
  className?: string;
}) {
  return (
    <Stagger className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4", className)}>
      {products.map((p, i) => (
        <StaggerItem key={p.id} index={i} className="h-full">
          <ProductCard product={p} eager={i < eagerCount} />
        </StaggerItem>
      ))}
    </Stagger>
  );
}
