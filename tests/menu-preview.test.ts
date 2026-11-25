import { describe, expect, it } from "vitest";
import { previewSource } from "@/modules/storefront/design-links";

describe("header product previews", () => {
  it("only previews category and collection links", () => {
    expect(previewSource("/c/kitchen-gadgets")).toEqual({ kind: "category", slug: "kitchen-gadgets" });
    expect(previewSource("/collections/on-sale/")).toEqual({ kind: "collection", slug: "on-sale" });
    expect(previewSource("/p/frying-pan")).toBeNull();
    expect(previewSource("/c/kitchen?sort=new")).toBeNull();
    expect(previewSource("https://example.com/c/x")).toBeNull();
    expect(previewSource("/search")).toBeNull();
  });
});
