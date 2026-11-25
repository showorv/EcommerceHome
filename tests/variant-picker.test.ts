import { describe, expect, it } from "vitest";
import {
  defaultSelection,
  findVariant,
  optionValues,
  pickValue,
  valueState,
  type PickVariant,
} from "@/modules/catalog/variant-picker";

const v = (id: string, options: Record<string, string>, available: number, price = 100_000): PickVariant => ({
  id,
  title: Object.values(options).join(" / "),
  options,
  price,
  compareAt: 0,
  available,
  mediaIds: [],
});

// Red comes in S and M; Blue only in M (sold out); Green only in L.
const variants = [
  v("red-s", { Colour: "Red", Size: "S" }, 0),
  v("red-m", { Colour: "Red", Size: "M" }, 4),
  v("blue-m", { Colour: "Blue", Size: "M" }, 0),
  v("green-l", { Colour: "Green", Size: "L" }, 2),
];

describe("variant picker", () => {
  it("lists option values in their original order", () => {
    expect(optionValues(["Colour", "Size"], variants)).toEqual([
      { name: "Colour", values: ["Red", "Blue", "Green"] },
      { name: "Size", values: ["S", "M", "L"] },
    ]);
  });

  it("starts on the first variant that is in stock", () => {
    expect(defaultSelection(variants)).toEqual({ Colour: "Red", Size: "M" });
    expect(defaultSelection([v("a", { Size: "S" }, 0)])).toEqual({ Size: "S" });
    expect(defaultSelection([])).toEqual({});
  });

  it("marks values as available, sold out, or not made in this combination", () => {
    const sel = { Colour: "Red", Size: "M" };
    expect(valueState(variants, sel, "Size", "S")).toBe("soldOut");
    expect(valueState(variants, sel, "Size", "L")).toBe("unavailable");
    expect(valueState(variants, sel, "Colour", "Blue")).toBe("soldOut");
    expect(valueState(variants, sel, "Colour", "Green")).toBe("unavailable");
  });

  it("jumps to the closest real variant when a combination doesn't exist", () => {
    // Red/M → pick Green: only Green/L exists.
    expect(pickValue(variants, { Colour: "Red", Size: "M" }, "Colour", "Green")).toEqual({
      Colour: "Green",
      Size: "L",
    });
    // Red/M → pick Blue keeps size M.
    expect(pickValue(variants, { Colour: "Red", Size: "M" }, "Colour", "Blue")).toEqual({
      Colour: "Blue",
      Size: "M",
    });
    expect(findVariant(variants, { Colour: "Blue", Size: "M" })?.id).toBe("blue-m");
    // Unknown value leaves the selection alone.
    expect(pickValue(variants, { Colour: "Red", Size: "M" }, "Colour", "Pink")).toEqual({ Colour: "Red", Size: "M" });
  });

  it("handles products with a single default variant", () => {
    const single = [v("only", {}, 3)];
    expect(optionValues([], single)).toEqual([]);
    expect(findVariant(single, defaultSelection(single))?.id).toBe("only");
  });
});
