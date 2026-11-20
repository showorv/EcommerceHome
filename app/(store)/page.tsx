import { Reveal } from "@/components/motion/primitives";
import { ProductGrid } from "@/components/store/product-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCardProducts } from "@/modules/catalog/storefront";

/**
 * Temporary home page. Step 1.10 replaces it with sections managed from the admin storefront builder
 * (FR-SF-01); the product grid below is the same component those sections will use.
 */
export default async function HomePage() {
  const products = await getCardProducts({ sort: "newest", limit: 8 });
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-20 md:py-28">
          <Reveal>
            <Badge variant="secondary" className="mb-4">
              Imported from China · Delivered across Bangladesh
            </Badge>
            <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight text-balance md:text-6xl">
              Smart gadgets for your <span className="text-brand">kitchen</span> and home.
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="text-muted-foreground max-w-xl text-lg">
              Cash on delivery all over the country. Phase 0 preview — the real home page is built from admin sections
              in Phase 1.
            </p>
          </Reveal>
          <Reveal delay={0.2} className="flex gap-3">
            <Button size="lg" className="bg-brand text-brand-foreground hover:bg-brand/90">
              Shop now
            </Button>
            <Button size="lg" variant="outline">
              Track order
            </Button>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24" aria-labelledby="new-arrivals">
        <Reveal>
          <h2 id="new-arrivals" className="mb-6 text-2xl font-bold tracking-tight">
            New arrivals
          </h2>
        </Reveal>
        {products.length > 0 ? (
          <ProductGrid products={products} />
        ) : (
          <p className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
            Products appear here as soon as they are set to Active in the admin.
          </p>
        )}
      </section>
    </>
  );
}
