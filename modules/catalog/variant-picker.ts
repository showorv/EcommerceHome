/**
 * Variant picking for quick view and the product page (FR-PC-04, FR-PD-02). Pure functions, client-safe.
 * A selection is { optionName: value }, e.g. { Colour: "Red", Size: "XL" }.
 */

export type PickVariant = {
  id: string;
  title: string;
  options: Record<string, string>;
  price: number;
  compareAt: number;
  available: number; // stock − reserved, never below 0
  mediaIds: string[];
};

export type Selection = Record<string, string>;
export type ValueState = "available" | "soldOut" | "unavailable";

/** Every option with its values, in the order they first appear in the variant list. */
export function optionValues(optionNames: string[], variants: PickVariant[]) {
  return optionNames.map((name) => {
    const values: string[] = [];
    for (const v of variants) {
      const val = v.options[name];
      if (val && !values.includes(val)) values.push(val);
    }
    return { name, values };
  });
}

function matches(v: PickVariant, sel: Selection, ignore?: string) {
  return Object.entries(sel).every(([k, val]) => k === ignore || v.options[k] === val);
}

export function findVariant(variants: PickVariant[], sel: Selection): PickVariant | null {
  return variants.find((v) => matches(v, sel)) ?? null;
}

/** Starts on the first variant that can be bought, so the visitor never lands on "Sold out" by default. */
export function defaultSelection(variants: PickVariant[]): Selection {
  const v = variants.find((x) => x.available > 0) ?? variants[0];
  return v ? { ...v.options } : {};
}

/**
 * How a value button should look given the other choices: "available", "soldOut" (exists but no stock),
 * or "unavailable" (that combination doesn't exist).
 */
export function valueState(variants: PickVariant[], sel: Selection, name: string, value: string): ValueState {
  const candidates = variants.filter((v) => v.options[name] === value && matches(v, sel, name));
  if (candidates.length === 0) return "unavailable";
  return candidates.some((v) => v.available > 0) ? "available" : "soldOut";
}

/**
 * Picks a value. If that exact combination doesn't exist (e.g. Blue only comes in M), it switches to the
 * closest variant that has the new value: most other options kept, in-stock first.
 */
export function pickValue(variants: PickVariant[], sel: Selection, name: string, value: string): Selection {
  const next = { ...sel, [name]: value };
  if (findVariant(variants, next)) return next;
  const withValue = variants.filter((v) => v.options[name] === value);
  if (withValue.length === 0) return sel;
  const score = (v: PickVariant) =>
    Object.entries(sel).filter(([k, val]) => k !== name && v.options[k] === val).length * 2 + (v.available > 0 ? 1 : 0);
  const best = withValue.reduce((a, b) => (score(b) > score(a) ? b : a));
  return { ...best.options };
}
