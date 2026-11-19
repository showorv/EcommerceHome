import { Lift, Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Temporary home page that shows the design system and motion primitives.
 * Phase 1 replaces it with sections managed from the admin storefront builder (FR-SF-01).
 */
const SAMPLE = [
  { name: "Electric milk frother", price: "৳650", was: "৳900", label: "Hot" },
  { name: "Silicone spatula set", price: "৳480", was: "৳600", label: "New" },
  { name: "Mini vacuum sealer", price: "৳1,250", was: "৳1,600", label: "Bestseller" },
  { name: "LED motion sensor light", price: "৳390", was: "৳550", label: "New" },
];

export default function HomePage() {
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

      <section className="mx-auto max-w-6xl px-4 pb-24">
        <Reveal>
          <h2 className="mb-6 text-2xl font-bold tracking-tight">Design system preview</h2>
        </Reveal>
        <Stagger className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {SAMPLE.map((p) => (
            <StaggerItem key={p.name}>
              <Lift className="group bg-card rounded-xl border p-3 shadow-sm transition-shadow hover:shadow-xl">
                <div className="from-accent to-secondary relative mb-3 aspect-square rounded-lg bg-gradient-to-br">
                  <Badge className="bg-brand text-brand-foreground absolute top-2 left-2">{p.label}</Badge>
                </div>
                <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                <p className="mt-1 text-sm">
                  <span className="font-bold">{p.price}</span>{" "}
                  <span className="text-muted-foreground line-through">{p.was}</span>
                </p>
              </Lift>
            </StaggerItem>
          ))}
        </Stagger>
      </section>
    </>
  );
}
