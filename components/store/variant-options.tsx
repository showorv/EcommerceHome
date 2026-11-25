"use client";

import { cn } from "@/lib/utils";
import {
  optionValues,
  pickValue,
  valueState,
  type PickVariant,
  type Selection,
} from "@/modules/catalog/variant-picker";

/**
 * Option buttons (Colour, Size, …). Sold-out values are struck through; combinations that don't exist
 * are dashed. Both can still be pressed: the picker then jumps to the closest real variant.
 */
export function VariantOptions({
  optionNames,
  variants,
  selection,
  onChange,
}: {
  optionNames: string[];
  variants: PickVariant[];
  selection: Selection;
  onChange: (next: Selection) => void;
}) {
  const options = optionValues(optionNames, variants).filter((o) => o.values.length > 0);
  if (options.length === 0) return null;
  return (
    <div className="grid gap-4">
      {options.map((opt) => (
        <fieldset key={opt.name} className="grid gap-2">
          <legend className="mb-2 text-sm">
            <span className="text-muted-foreground">{opt.name}:</span>{" "}
            <span className="font-medium">{selection[opt.name] ?? "—"}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {opt.values.map((value) => {
              const state = valueState(variants, selection, opt.name, value);
              const selected = selection[opt.name] === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange(pickValue(variants, selection, opt.name, value))}
                  className={cn(
                    "focus-visible:ring-ring min-w-11 rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:border-foreground/40 bg-background",
                    state === "soldOut" && !selected && "text-muted-foreground line-through",
                    state === "unavailable" && !selected && "text-muted-foreground border-dashed",
                  )}
                >
                  {value}
                  {state === "soldOut" && <span className="sr-only"> (sold out)</span>}
                  {state === "unavailable" && <span className="sr-only"> (not available with this choice)</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
