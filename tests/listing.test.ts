import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  colourLabel,
  decodeCursor,
  encodeCursor,
  EMPTY_QUERY,
  filterConditions,
  keysetMatch,
  listingSearch,
  MAX_PAGE,
  pageWindow,
  parseListingParams,
} from "@/modules/catalog/listing";
import { productColours } from "@/modules/catalog/logic";

describe("listing URL parameters", () => {
  it("reads filters and converts taka to poisha", () => {
    const q = parseListingParams({
      sort: "price-asc",
      min: "500",
      max: "2000",
      colour: ["Red", " sky  blue "],
      cat: "blenders",
      stock: "1",
      rating: "4",
      page: "3",
    });
    expect(q).toEqual({
      sort: "price-asc",
      min: 50_000,
      max: 200_000,
      colours: ["red", "sky blue"],
      cats: ["blenders"],
      inStock: true,
      rating: 4,
      page: 3,
    });
  });

  it("ignores anything that doesn't parse instead of failing", () => {
    const q = parseListingParams({
      sort: "cheapest",
      min: "-5",
      max: "abc",
      colour: ["<script>", "", "x".repeat(40)],
      cat: ["../etc", "Bad Slug"],
      stock: "yes",
      rating: "5",
      page: "0",
    });
    expect(q).toEqual(EMPTY_QUERY);
    expect(parseListingParams({ page: "99999" }).page).toBe(MAX_PAGE);
    expect(parseListingParams({ page: "2.5" }).page).toBe(1);
  });

  it("swaps a reversed price range and drops a zero minimum", () => {
    const q = parseListingParams(new URLSearchParams("min=2000&max=500"));
    expect([q.min, q.max]).toEqual([50_000, 200_000]);
    expect(parseListingParams({ min: "0" }).min).toBeNull();
  });

  it("writes the same URL for the same filters, leaving out the default sort", () => {
    const a = parseListingParams({ colour: ["red", "blue"], sort: "newest", stock: "1" });
    const b = parseListingParams({ stock: "1", colour: ["blue", "red"] });
    expect(listingSearch(a, "newest")).toBe(listingSearch(b, "newest"));
    expect(listingSearch(a, "newest")).toBe("?colour=blue&colour=red&stock=1");
    expect(listingSearch(EMPTY_QUERY)).toBe("");
    // Round trip
    const q = parseListingParams({ min: "100", max: "900", cat: "a", rating: "3", page: "2", sort: "discount" });
    expect(parseListingParams(new URLSearchParams(listingSearch(q).slice(1)))).toEqual(q);
  });

  it("counts filters in use", () => {
    expect(activeFilterCount(EMPTY_QUERY)).toBe(0);
    expect(activeFilterCount(parseListingParams({ min: "1", max: "9", colour: ["a", "b"], stock: "1" }))).toBe(4);
  });

  it("shows first, last and nearby page numbers with gaps", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(5, 10)).toEqual([1, null, 3, 4, 5, 6, 7, null, 10]);
    expect(pageWindow(1, 4)).toEqual([1, 2, 3, 4]);
  });

  it("formats colour names for display", () => {
    expect(colourLabel("sky blue")).toBe("Sky Blue");
    expect(colourLabel("off-white")).toBe("Off-White");
  });
});

describe("listing query", () => {
  it("builds match conditions only for filters in use", () => {
    expect(filterConditions(EMPTY_QUERY, [])).toEqual([]);
    const q = parseListingParams({ min: "500", colour: "red", cat: "x", stock: "1", rating: "3" });
    expect(filterConditions(q, ["id1", "id2"])).toEqual([
      { priceMin: { $gte: 50_000 } },
      { colours: { $in: ["red"] } },
      { categoryIds: { $in: ["id1", "id2"] } },
      { inStock: true },
      { ratingAvg: { $gte: 3 } },
    ]);
  });

  it("continues after the last card for any sort direction", () => {
    expect(
      keysetMatch(
        [
          ["priceMin", 1],
          ["_id", -1],
        ],
        [500, "abc"],
      ),
    ).toEqual({ $or: [{ priceMin: { $gt: 500 } }, { priceMin: 500, _id: { $lt: "abc" } }] });
    expect(keysetMatch([["_id", 1]], ["abc"])).toEqual({ _id: { $gt: "abc" } });
  });

  it("round-trips cursors and rejects tampered ones", () => {
    const id = "64b7f0c2a1b2c3d4e5f60718";
    const date = "2026-11-20T10:00:00.000Z";
    const c = encodeCursor([date, id]);
    expect(decodeCursor(c, "newest")).toEqual([date, id]);
    expect(decodeCursor(c, "price-asc")).toBeNull(); // wrong value types for that sort
    expect(decodeCursor(encodeCursor([0, 5, id]), "bestselling")).toBeNull(); // _pub must be a date
    expect(decodeCursor(encodeCursor([{ $gt: "" } as unknown as string, id]), "newest")).toBeNull();
    expect(decodeCursor("not a cursor!", "newest")).toBeNull();
    expect(decodeCursor(encodeCursor([1, 2, 3]), "newest")).toBeNull();
  });
});

describe("colour facet", () => {
  it("collects colour values from active variants", () => {
    expect(
      productColours([
        { options: { Colour: "Red", Size: "L" }, active: true },
        { options: { color: " Sky  Blue " }, active: true },
        { options: { Colour: "red" }, active: true },
        { options: { Colour: "Green" }, active: false },
        { options: { Size: "M" }, active: true },
      ]),
    ).toEqual(["red", "sky blue"]);
  });
});
