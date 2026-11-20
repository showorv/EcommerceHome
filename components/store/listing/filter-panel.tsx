"use client";

import { Check, Star } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { clearFilters, colourLabel, type ListingQuery } from "@/modules/catalog/listing";
import type { ListingFacets } from "@/modules/catalog/listing-data";
import { useListing } from "./listing-state";

/** Filter controls (FR-SF-07): category, price, colour, in stock, rating. Each change applies at once. */
export function FilterPanel({ facets, idPrefix }: { facets: ListingFacets; idPrefix: string }) {
  const { query: q, apply } = useListing();
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="grid gap-6">
      {facets.cats.length > 0 && (
        <Section title="Category">
          <ul className="grid gap-2">
            {facets.cats.map((c) => {
              const id = `${idPrefix}-cat-${c.slug}`;
              return (
                <li key={c.slug} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={q.cats.includes(c.slug)}
                    onCheckedChange={() => apply({ ...q, cats: toggle(q.cats, c.slug) })}
                  />
                  <label htmlFor={id} className="flex flex-1 cursor-pointer justify-between gap-2 text-sm">
                    <span>{c.name}</span>
                    <span className="text-muted-foreground tabular-nums">{c.count}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {facets.total > 1 && facets.price.max > facets.price.min && (
        <Section title="Price (৳)">
          {/* Re-mount when the range changes from outside (e.g. a chip was removed). */}
          <PriceForm key={`${q.min}-${q.max}`} idPrefix={idPrefix} facets={facets} />
        </Section>
      )}

      {facets.colours.length > 0 && (
        <Section title="Colour">
          <ul className="flex flex-wrap gap-2">
            {facets.colours.map((c) => {
              const on = q.colours.includes(c.value);
              return (
                <li key={c.value}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => apply({ ...q, colours: toggle(q.colours, c.value) })}
                    className={cn(
                      "flex h-9 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors",
                      on ? "border-primary bg-primary/5 ring-primary ring-1" : "hover:border-muted-foreground/50",
                    )}
                  >
                    <Swatch colour={c.value} on={on} />
                    {colourLabel(c.value)}
                    <span className="text-muted-foreground text-xs tabular-nums">{c.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="Availability">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${idPrefix}-stock`}
            checked={q.inStock}
            onCheckedChange={(v) => apply({ ...q, inStock: v === true })}
          />
          <label htmlFor={`${idPrefix}-stock`} className="flex flex-1 cursor-pointer justify-between gap-2 text-sm">
            <span>In stock only</span>
            <span className="text-muted-foreground tabular-nums">{facets.inStock}</span>
          </label>
        </div>
      </Section>

      {facets.hasRatings && (
        <Section title="Customer rating">
          <div role="radiogroup" aria-label="Customer rating" className="grid gap-1">
            {([0, 4, 3] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={q.rating === r}
                onClick={() => apply({ ...q, rating: r })}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-md px-2 text-left text-sm",
                  q.rating === r ? "bg-accent font-medium" : "hover:bg-accent/60",
                )}
              >
                {r === 0 ? (
                  "Any rating"
                ) : (
                  <>
                    <span className="flex" aria-hidden>
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            "size-3.5",
                            i < r ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
                          )}
                        />
                      ))}
                    </span>
                    {r} stars &amp; up
                  </>
                )}
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-3 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function PriceForm({ idPrefix, facets }: { idPrefix: string; facets: ListingFacets }) {
  const { query: q, apply } = useListing();
  const [min, setMin] = useState(q.min !== null ? String(q.min / 100) : "");
  const [max, setMax] = useState(q.max !== null ? String(q.max / 100) : "");
  const lo = Math.floor(facets.price.min / 100);
  const hi = Math.ceil(facets.price.max / 100);

  function submit(e: FormEvent) {
    e.preventDefault();
    const toPoisha = (v: string) => (/^\d{1,7}$/.test(v.trim()) ? Number(v.trim()) * 100 : null);
    let a = toPoisha(min);
    let b = toPoisha(max);
    if (a !== null && b !== null && a > b) [a, b] = [b, a];
    apply({ ...q, min: a || null, max: b });
  }

  return (
    <form onSubmit={submit} className="grid gap-2">
      <div className="flex items-center gap-2">
        <label htmlFor={`${idPrefix}-min`} className="sr-only">
          Lowest price in taka
        </label>
        <Input
          id={`${idPrefix}-min`}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder={String(lo)}
          value={min}
          onChange={(e) => setMin(e.target.value)}
          className="h-9"
        />
        <span className="text-muted-foreground" aria-hidden>
          –
        </span>
        <label htmlFor={`${idPrefix}-max`} className="sr-only">
          Highest price in taka
        </label>
        <Input
          id={`${idPrefix}-max`}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder={String(hi)}
          value={max}
          onChange={(e) => setMax(e.target.value)}
          className="h-9"
        />
      </div>
      <Button type="submit" variant="outline" size="sm">
        Apply price
      </Button>
    </form>
  );
}

/** Common colour names → swatch colour. Anything else shows a neutral multicolour dot. */
const SWATCHES: Record<string, string> = {
  black: "#111827",
  white: "#ffffff",
  grey: "#9ca3af",
  gray: "#9ca3af",
  silver: "#d1d5db",
  red: "#dc2626",
  maroon: "#7f1d1d",
  pink: "#ec4899",
  "rose gold": "#e8b4a0",
  orange: "#f97316",
  yellow: "#facc15",
  gold: "#d4a017",
  beige: "#e7d8b9",
  cream: "#f5ecd7",
  brown: "#7c4a21",
  green: "#16a34a",
  "dark green": "#14532d",
  mint: "#a7f3d0",
  olive: "#6b7d2a",
  blue: "#2563eb",
  "sky blue": "#7dd3fc",
  "light blue": "#93c5fd",
  navy: "#1e3a8a",
  "navy blue": "#1e3a8a",
  teal: "#0d9488",
  purple: "#9333ea",
  violet: "#7c3aed",
  lavender: "#c4b5fd",
  transparent: "transparent",
  clear: "transparent",
};

function Swatch({ colour, on }: { colour: string; on: boolean }) {
  const fill = SWATCHES[colour];
  return (
    <span
      aria-hidden
      className="relative grid size-7 shrink-0 place-items-center rounded-full border shadow-inner"
      style={{
        background:
          fill === "transparent"
            ? "repeating-conic-gradient(#e5e7eb 0 25%, #fff 0 50%) 50% / 8px 8px"
            : (fill ?? "conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)"),
      }}
    >
      {on && (
        <span className="bg-background/90 grid size-4 place-items-center rounded-full">
          <Check className="size-3" />
        </span>
      )}
    </span>
  );
}

/** Removable chips for the filters in use, plus "Clear all". */
export function ActiveFilters({ facets }: { facets: ListingFacets }) {
  const { query: q, apply } = useListing();
  const chips: { label: string; next: ListingQuery }[] = [];
  for (const slug of q.cats) {
    chips.push({
      label: facets.cats.find((c) => c.slug === slug)?.name ?? slug,
      next: { ...q, cats: q.cats.filter((c) => c !== slug) },
    });
  }
  if (q.min !== null || q.max !== null) {
    const t = (p: number) => `৳${(p / 100).toLocaleString("en-IN")}`;
    chips.push({
      label:
        q.min !== null && q.max !== null
          ? `${t(q.min)} – ${t(q.max)}`
          : q.min !== null
            ? `From ${t(q.min)}`
            : `Up to ${t(q.max!)}`,
      next: { ...q, min: null, max: null },
    });
  }
  for (const c of q.colours)
    chips.push({ label: colourLabel(c), next: { ...q, colours: q.colours.filter((x) => x !== c) } });
  if (q.inStock) chips.push({ label: "In stock", next: { ...q, inStock: false } });
  if (q.rating) chips.push({ label: `${q.rating}★ & up`, next: { ...q, rating: 0 } });
  if (chips.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Filters in use">
      {chips.map((c) => (
        <li key={c.label}>
          <button
            type="button"
            onClick={() => apply(c.next)}
            className="bg-secondary hover:bg-secondary/70 flex h-8 items-center gap-1 rounded-full pr-2 pl-3 text-sm"
            aria-label={`Remove filter: ${c.label}`}
          >
            {c.label}
            <span aria-hidden className="text-muted-foreground text-base leading-none">
              ×
            </span>
          </button>
        </li>
      ))}
      {chips.length > 1 && (
        <li>
          <button
            type="button"
            onClick={() => apply(clearFilters(q))}
            className="text-muted-foreground hover:text-foreground h-8 px-2 text-sm underline underline-offset-4"
          >
            Clear all
          </button>
        </li>
      )}
    </ul>
  );
}
