import { describe, expect, it } from "vitest";
import {
  cleanQuery,
  editDistance,
  normalizeText,
  queryTokens,
  rankDocs,
  searchWords,
  type SearchDoc,
} from "@/modules/catalog/search";

function doc(id: string, title: string, weak: string[] = [], rank = 0): SearchDoc {
  return { id, words: searchWords({ strong: [title], weak }), phrase: normalizeText(title), rank };
}

const docs = [
  doc("chopper", "Mini Electric Chopper 2L", ["kitchen", "রান্নাঘর"], 5),
  doc("blender", "Portable Juice Blender", ["kitchen", "smoothie"], 3),
  doc("kettle", "Electric Kettle 1.8L", ["kitchen", "tea"], 1),
  doc("lamp", "LED Desk Lamp", ["light", "study"], 9),
  doc("bn", "ইলেকট্রিক চপার", ["কিচেন"], 0),
];
const ids = (q: string) => rankDocs(docs, q).map((h) => h.id);

describe("search text", () => {
  it("normalises case, accents and punctuation but keeps Bangla", () => {
    expect(normalizeText("  Café-Blender, 2L! ")).toBe("cafe blender 2l");
    expect(normalizeText("ইলেকট্রিক চপার")).toBe("ইলেকট্রিক চপার");
  });

  it("drops stop words unless nothing else is left, and caps the length", () => {
    expect(queryTokens("blender for the kitchen")).toEqual(["blender", "kitchen"]);
    expect(queryTokens("the")).toEqual(["the"]);
    expect(queryTokens("a b c d e f g h")).toHaveLength(6);
    expect(cleanQuery("  mini   chopper ")).toBe("mini chopper");
    expect(cleanQuery("x".repeat(200))).toHaveLength(80);
  });

  it("counts typos, including swapped letters", () => {
    expect(editDistance("chopper", "chopper", 2)).toBe(0);
    expect(editDistance("chpper", "chopper", 2)).toBe(1);
    expect(editDistance("cohpper", "chopper", 2)).toBe(1);
    expect(editDistance("blndr", "blender", 2)).toBe(2);
    expect(editDistance("lamp", "kettle", 1)).toBe(2); // gives up early: anything above max
  });
});

describe("search ranking", () => {
  it("finds exact words, word starts and typos", () => {
    expect(ids("chopper")).toEqual(["chopper"]);
    expect(ids("chop")).toEqual(["chopper"]);
    expect(ids("chpper")).toEqual(["chopper"]);
    expect(ids("blendr")).toEqual(["blender"]);
    expect(ids("ketle")).toEqual(["kettle"]);
  });

  it("needs every word to match, falling back to all but one when nothing does", () => {
    expect(ids("electric chopper")).toEqual(["chopper"]);
    expect(ids("electric kettle")).toEqual(["kettle"]); // the chopper is electric too, but not a kettle
    expect(ids("electric lamp")).toEqual(["lamp", "chopper", "kettle"]); // no electric lamp: closest first
    expect(ids("chopper xqzt")).toEqual(["chopper"]);
    expect(ids("xqzt vbnm")).toEqual([]);
  });

  it("ranks title matches above tag matches, then by rank", () => {
    expect(ids("kitchen")).toEqual(["chopper", "blender", "kettle"]); // all tags: best sellers first
    const both = rankDocs([doc("tag", "Mug", ["electric"]), doc("title", "Electric Mug")], "electric");
    expect(both.map((h) => h.id)).toEqual(["title", "tag"]);
  });

  it("does not stretch short words into typos", () => {
    expect(ids("tea")).toEqual(["kettle"]);
    expect(ids("tex")).toEqual([]);
  });

  it("searches Bangla", () => {
    expect(ids("চপার")).toEqual(["bn"]);
    expect(ids("রান্নাঘর")).toEqual(["chopper"]);
  });

  it("returns nothing for an empty query", () => {
    expect(rankDocs(docs, "   ")).toEqual([]);
    expect(rankDocs(docs, "!!!")).toEqual([]);
  });
});
