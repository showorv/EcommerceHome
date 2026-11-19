import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { trustFilter } from "@/lib/db/trusted-filter";
import {
  allocateLandedCost,
  discountPercent,
  productMatchesRules,
  rulesToFilter,
  slugify,
  suggestSku,
  summariseVariants,
  uniqueSlug,
  variantCombinations,
  variantTitle,
  weightedAverageCost,
  type CollectionRule,
} from "@/modules/catalog/logic";
import { productInput, youtubeId } from "@/modules/catalog/schemas";

describe("slugs", () => {
  it("makes clean URL slugs", () => {
    expect(slugify("Mini Electric Chopper 2L!")).toBe("mini-electric-chopper-2l");
    expect(slugify("  Café & Kitchen  ")).toBe("cafe-and-kitchen");
    expect(slugify("রান্নাঘর")).toBe("");
    expect(slugify("a".repeat(100))).toHaveLength(80);
  });

  it("finds the first free slug", async () => {
    const taken = new Set(["chopper", "chopper-2"]);
    expect(await uniqueSlug("chopper", async (s) => taken.has(s))).toBe("chopper-3");
    expect(await uniqueSlug("", async () => false)).toBe("item");
  });
});

describe("landed cost", () => {
  it("spreads extra costs by goods value and keeps the exact total", () => {
    // 10 × ৳100 and 5 × ৳400 = ৳1,000 + ৳2,000 goods; ৳300 shipping split 1:2
    const res = allocateLandedCost(
      [
        { qty: 10, unitCost: 10_000 },
        { qty: 5, unitCost: 40_000 },
      ],
      30_000,
    );
    expect(res[0]).toEqual({ landedTotal: 110_000, landedUnitCost: 11_000 });
    expect(res[1]).toEqual({ landedTotal: 220_000, landedUnitCost: 44_000 });
    expect(res.reduce((a, r) => a + r.landedTotal, 0)).toBe(330_000);
  });

  it("puts rounding remainders on the largest line", () => {
    const res = allocateLandedCost(
      [
        { qty: 1, unitCost: 100 },
        { qty: 1, unitCost: 100 },
        { qty: 1, unitCost: 100 },
      ],
      100,
    );
    expect(res.reduce((a, r) => a + r.landedTotal, 0)).toBe(400);
  });

  it("splits by quantity when unit costs are all zero", () => {
    const res = allocateLandedCost(
      [
        { qty: 3, unitCost: 0 },
        { qty: 1, unitCost: 0 },
      ],
      400,
    );
    expect(res.map((r) => r.landedTotal)).toEqual([300, 100]);
  });

  it("averages cost on receipt and ignores negative stock", () => {
    expect(weightedAverageCost(10, 10_000, 10, 20_000)).toBe(15_000);
    expect(weightedAverageCost(0, 0, 5, 12_345)).toBe(12_345);
    expect(weightedAverageCost(-3, 99_999, 2, 5_000)).toBe(5_000);
  });
});

describe("variants", () => {
  it("builds every option combination", () => {
    const combos = variantCombinations([
      { name: "Colour", values: ["Red", "Blue"] },
      { name: "Size", values: ["S", "M", " "] },
    ]);
    expect(combos).toHaveLength(4);
    expect(combos[0]).toEqual({ Colour: "Red", Size: "S" });
    expect(variantCombinations([])).toEqual([{}]);
  });

  it("titles and SKUs", () => {
    expect(variantTitle({ Size: "M", Colour: "Red" }, ["Colour", "Size"])).toBe("Red / M");
    expect(suggestSku("mini-electric-chopper", { Colour: "Red" })).toBe("MINI-ELEC-RED");
  });

  it("summarises price range and stock from active variants only", () => {
    const s = summariseVariants([
      { price: 120_000, compareAtPrice: 150_000, stock: 5, reserved: 2, active: true },
      { price: 90_000, compareAtPrice: 0, stock: 0, reserved: 0, active: true },
      { price: 10, compareAtPrice: 0, stock: 99, reserved: 0, active: false },
    ]);
    expect(s).toMatchObject({ priceMin: 90_000, priceMax: 120_000, totalStock: 3, inStock: true, onSale: true });
    expect(discountPercent(120_000, 150_000)).toBe(20);
    expect(discountPercent(150_000, 120_000)).toBe(0);
  });
});

describe("rule-based collections", () => {
  const product = {
    priceMin: 45_000,
    categoryIds: ["c1"],
    tags: ["kitchen"],
    labels: ["new"],
    inStock: true,
    onSale: false,
  };
  const under500: CollectionRule = { field: "price", op: "lt", value: 50_000 };
  const onSale: CollectionRule = { field: "onSale", op: "eq", value: true };

  it("matches all / any", () => {
    expect(productMatchesRules(product, [under500], "all")).toBe(true);
    expect(productMatchesRules(product, [under500, onSale], "all")).toBe(false);
    expect(productMatchesRules(product, [under500, onSale], "any")).toBe(true);
    expect(productMatchesRules(product, [], "all")).toBe(false);
  });

  it("builds the matching MongoDB filter", () => {
    expect(rulesToFilter([under500], "all")).toEqual({ priceMin: { $lt: 50_000 } });
    expect(rulesToFilter([under500, onSale], "any")).toEqual({
      $or: [{ priceMin: { $lt: 50_000 } }, { onSale: true }],
    });
    expect(rulesToFilter([], "all")).toBeNull();
  });
});

describe("trusted filters", () => {
  it("marks our own operators trusted and leaves plain values alone", () => {
    const id = new mongoose.Types.ObjectId();
    const f = trustFilter({ status: "active", _id: id, priceMin: { $lt: 5 }, $or: [{ tags: { $in: ["a"] } }] });
    const sanitized = mongoose.sanitizeFilter(f);
    expect(sanitized.priceMin).toMatchObject({ $lt: 5 }); // not wrapped in $eq
    expect((sanitized.$or as { tags: unknown }[])[0]!.tags).toMatchObject({ $in: ["a"] });
    expect(sanitized._id).toBe(id);
  });

  it("still neutralises operators that were not trusted", () => {
    const sanitized = mongoose.sanitizeFilter({ email: { $ne: "" } } as Record<string, unknown>);
    expect(sanitized.email).toEqual({ $eq: { $ne: "" } });
  });
});

describe("product validation", () => {
  const base = {
    title: { en: "Chopper", bn: "" },
    slug: "",
    status: "draft",
    variants: [{ sku: "chop-1", price: "1450.50", compareAtPrice: "1800" }],
  };

  it("converts taka to poisha and upper-cases SKUs", () => {
    const p = productInput.parse(base);
    expect(p.variants[0]).toMatchObject({ sku: "CHOP-1", price: 145_050, compareAtPrice: 180_000 });
  });

  it("rejects duplicate SKUs, bad compare-at prices and active products without images", () => {
    expect(productInput.safeParse({ ...base, variants: [...base.variants, ...base.variants] }).success).toBe(false);
    expect(
      productInput.safeParse({ ...base, variants: [{ sku: "A", price: "100", compareAtPrice: "90" }] }).success,
    ).toBe(false);
    expect(productInput.safeParse({ ...base, status: "active" }).success).toBe(false);
  });

  it("only accepts media the store can show (Cloudinary, local uploads, YouTube)", () => {
    const withMedia = (url: string) => productInput.safeParse({ ...base, media: [{ type: "image", url }] }).success;
    expect(withMedia("https://res.cloudinary.com/x/a.jpg")).toBe(true);
    expect(withMedia("/uploads/images/a.jpg")).toBe(true);
    expect(withMedia("/uploads/../.env.local")).toBe(false);
    expect(withMedia("javascript:alert(1)")).toBe(false);
    expect(withMedia("http://insecure.example/a.jpg")).toBe(false);
    expect(withMedia("https://other-site.example/a.jpg")).toBe(false);
    expect(
      productInput.safeParse({ ...base, media: [{ type: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" }] }).success,
    ).toBe(true);
  });

  it("reads YouTube ids", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://vimeo.com/123")).toBeNull();
  });
});
