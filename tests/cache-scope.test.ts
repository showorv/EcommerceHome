import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isStoreTag,
  MAX_WARM_PATHS,
  pathForTag,
  productScopeTags,
  TAGS,
  warmPaths,
} from "@/modules/catalog/cache-tags";

// Kitchen > Gadgets > Choppers, and an unrelated Toys category.
const cats = [
  { id: "k", slug: "kitchen", parentId: null },
  { id: "g", slug: "gadgets", parentId: "k" },
  { id: "c", slug: "choppers", parentId: "g" },
  { id: "t", slug: "toys", parentId: null },
];
const cols = [
  { slug: "best-picks", type: "manual" as const, productIds: ["p1", "p9"] },
  { slug: "other-picks", type: "manual" as const, productIds: ["p9"] },
  { slug: "under-500", type: "rule" as const, productIds: [] },
];

describe("on-demand revalidation scope (1.15)", () => {
  it("refreshes the product, its categories up the tree, its collections and the store-wide lists only", () => {
    const tags = productScopeTags([{ id: "p1", slug: "mini-chopper", categoryIds: ["c"] }], cats, cols);
    expect(tags.sort()).toEqual(
      [
        TAGS.productLists,
        "product:mini-chopper",
        "category:choppers",
        "category:gadgets",
        "category:kitchen",
        "collection:best-picks",
        "collection:under-500",
      ].sort(),
    );
    expect(tags).not.toContain(TAGS.catalog);
    expect(tags).not.toContain("category:toys");
    expect(tags).not.toContain("collection:other-picks");
  });

  it("also refreshes the pages a product left (old address, old category)", () => {
    const tags = productScopeTags(
      [
        { id: "p1", slug: "chopper-2l", categoryIds: ["t"] },
        { id: "p1", slug: "mini-chopper", categoryIds: ["c"] },
      ],
      cats,
      [],
    );
    for (const t of ["product:chopper-2l", "product:mini-chopper", "category:toys", "category:choppers"]) {
      expect(tags).toContain(t);
    }
  });

  it("copes with unknown and looping categories", () => {
    const loop = [
      { id: "a", slug: "a", parentId: "b" },
      { id: "b", slug: "b", parentId: "a" },
    ];
    const tags = productScopeTags([{ id: "p", slug: "x", categoryIds: ["a", "missing"] }], loop, []);
    expect(tags).toContain("category:a");
    expect(tags).toContain("category:b");
  });

  it("the revalidate endpoint accepts only tags the store uses", () => {
    for (const t of ["catalog", "product-lists", "navigation", "design", "cmsPages", "product:mini-chopper-2l"]) {
      expect(isStoreTag(t), t).toBe(true);
    }
    for (const t of ["", "product:", "product:Bad Slug", "user:1", "products", "page:../x"]) {
      expect(isStoreTag(t), t).toBe(false);
    }
  });

  it("visits the affected pages after a change, product pages first", () => {
    expect(pathForTag("product:mini-chopper")).toBe("/p/mini-chopper");
    expect(pathForTag("category:kitchen")).toBe("/c/kitchen");
    expect(pathForTag("collection:best-picks")).toBe("/collections/best-picks");
    expect(pathForTag("cmsPage:returns")).toBe("/pages/returns");
    expect(pathForTag("page:home")).toBe("/");
    expect(pathForTag(TAGS.productLists)).toBe("/");
    expect(pathForTag(TAGS.catalog)).toBeNull();
    expect(pathForTag(TAGS.cmsPages)).toBeNull();
    expect(warmPaths([TAGS.productLists, "category:kitchen", "product:a", "page:home", "product:b"])).toEqual([
      "/p/a",
      "/p/b",
      "/",
      "/c/kitchen",
    ]);
    const many = Array.from({ length: 50 }, (_, i) => `product:p${i}`);
    expect(warmPaths(many)).toHaveLength(MAX_WARM_PATHS);
  });

  it("catalogue actions no longer refresh the whole catalogue on every save", () => {
    const src = readFileSync("modules/catalog/actions.ts", "utf8");
    expect(src).not.toMatch(/updateTag\(|TAGS\.catalog/);
  });
});
