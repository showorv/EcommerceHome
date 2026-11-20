import { describe, expect, it } from "vitest";
import {
  cleanSections,
  defaultHomeSections,
  dhakaInputToIso,
  isLive,
  isoToDhakaInput,
  isSafeHref,
  newSection,
  nextChange,
  scheduleState,
  sectionsInput,
  SECTION_TYPES,
} from "@/modules/storefront/sections";

const NOW = Date.parse("2026-11-20T06:00:00Z");
const at = (iso: string | null) => ({ hidden: false, startAt: iso, endAt: null });

describe("section validation", () => {
  it("accepts the default of every section type except a video without a link", () => {
    for (const t of SECTION_TYPES) {
      const r = sectionsInput.safeParse([newSection(t)]);
      if (t === "video") expect(r.success).toBe(false);
      else expect(r.success, t).toBe(true);
    }
    expect(sectionsInput.safeParse(defaultHomeSections()).success).toBe(true);
  });

  it("builds the same starter home page every time", () => {
    expect(JSON.stringify(defaultHomeSections())).toBe(JSON.stringify(defaultHomeSections()));
  });

  it("only allows store links, https links and phone links on buttons", () => {
    for (const ok of ["", "/c/kitchen", "/search?q=chopper", "https://wa.me/8801700000000", "tel:+8801700000000"])
      expect(isSafeHref(ok), ok).toBe(true);
    for (const bad of [
      "javascript:alert(1)",
      "//evil.com",
      "http://insecure.com",
      "data:text/html,x",
      "/a b",
      "/\\evil",
    ])
      expect(isSafeHref(bad), bad).toBe(false);
  });

  it("rejects pictures from other websites and explains which section is wrong", () => {
    const banner = newSection("banner");
    banner.data.image.url = "https://evil.example/x.png";
    const r = sectionsInput.safeParse([newSection("richText"), banner]);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/^Promo banner \(section 2\): Upload the image/);
  });

  it("needs a collection when showing a collection, and an end after the start", () => {
    const p = newSection("productCarousel", "featuredCollection");
    expect(sectionsInput.safeParse([p]).success).toBe(false);
    p.data.refId = "64b7f0c2a1b2c3d4e5f60718";
    expect(sectionsInput.safeParse([p]).success).toBe(true);
    const s = { ...newSection("richText"), startAt: "2026-11-21T00:00:00Z", endAt: "2026-11-20T00:00:00Z" };
    expect(sectionsInput.safeParse([s]).success).toBe(false);
  });

  it("refuses duplicate ids and too many sections", () => {
    const a = newSection("faq");
    expect(sectionsInput.safeParse([a, { ...a }]).success).toBe(false);
    expect(sectionsInput.safeParse(Array.from({ length: 31 }, () => newSection("richText"))).success).toBe(false);
  });

  it("skips stored sections that no longer validate instead of failing the page", () => {
    const good = newSection("richText");
    expect(cleanSections([good, { type: "nope" }, null])).toEqual([good]);
    expect(cleanSections("x")).toEqual([]);
  });
});

describe("scheduling", () => {
  it("shows a section only inside its dates and when not hidden", () => {
    expect(isLive(at(null), NOW)).toBe(true);
    expect(isLive(at("2026-11-21T00:00:00Z"), NOW)).toBe(false);
    expect(isLive({ hidden: false, startAt: null, endAt: "2026-11-20T06:00:00Z" }, NOW)).toBe(false); // ends exactly now
    expect(isLive({ hidden: true, startAt: null, endAt: null }, NOW)).toBe(false);
    expect(scheduleState(at("2026-11-21T00:00:00Z"), NOW)).toBe("scheduled");
    expect(scheduleState({ hidden: false, startAt: null, endAt: "2026-11-01T00:00:00Z" }, NOW)).toBe("ended");
  });

  it("finds the next start or end so the page can refresh on time", () => {
    expect(
      nextChange(
        [
          { hidden: false, startAt: "2026-11-01T00:00:00Z", endAt: "2026-11-25T00:00:00Z" },
          { hidden: false, startAt: "2026-11-22T00:00:00Z", endAt: null },
          { hidden: true, startAt: "2026-11-20T07:00:00Z", endAt: null }, // hidden: ignored
        ],
        NOW,
      ),
    ).toBe(Date.parse("2026-11-22T00:00:00Z"));
    expect(nextChange([at(null)], NOW)).toBeNull();
  });

  it("reads and writes admin dates in Bangladesh time", () => {
    expect(dhakaInputToIso("2026-11-21T10:30")).toBe("2026-11-21T04:30:00.000Z");
    expect(isoToDhakaInput("2026-11-21T04:30:00.000Z")).toBe("2026-11-21T10:30");
    expect(dhakaInputToIso("21/11/2026")).toBeNull();
    expect(isoToDhakaInput(null)).toBe("");
  });
});
