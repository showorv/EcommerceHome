import { readFileSync } from "node:fs";
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
  it("accepts the default of every section type except those still missing a video or pictures", () => {
    for (const t of SECTION_TYPES) {
      const r = sectionsInput.safeParse([newSection(t)]);
      if (t === "video" || t === "story") expect(r.success, t).toBe(false);
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

describe("motion settings (1.13)", () => {
  it("turns parallax on for heroes saved before the setting existed", () => {
    const hero = newSection("hero") as { data: Record<string, unknown> };
    delete hero.data.parallax;
    const [clean] = cleanSections([hero]);
    expect(clean?.type === "hero" && clean.data.parallax).toBe(true);
  });

  it("needs two to five story steps, each with a title and an uploaded picture", () => {
    const story = newSection("story");
    expect(sectionsInput.safeParse([story]).error?.issues[0]?.message).toMatch(/Add a picture for each step/);
    story.data.steps = story.data.steps.map((st, i) => ({
      ...st,
      image: { url: `/uploads/images/s${i}.webp`, alt: "" },
    }));
    expect(sectionsInput.safeParse([story]).success).toBe(true);
    expect(
      sectionsInput.safeParse([{ ...story, data: { ...story.data, steps: story.data.steps.slice(0, 1) } }]).success,
    ).toBe(false);
    story.data.steps[0]!.title = "";
    expect(sectionsInput.safeParse([story]).success).toBe(false);
  });

  it("keeps scroll motion behind the reduce-motion and browser-support checks", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const block = css.slice(css.indexOf("@supports (animation-timeline: view())"), css.indexOf("@keyframes reveal-in"));
    expect(block).toContain("@media (prefers-reduced-motion: no-preference)");
    // Every rule that animates .reveal / .parallax sits inside that guarded block.
    expect(css.split("animation-timeline").length - 1).toBe(block.split("animation-timeline").length - 1);
    // Only opacity and transform are animated (NFR-PF-03).
    for (const name of ["reveal-in", "parallax-drift", "page-fade-out", "page-fade-in", "page-rise-in"]) {
      const start = css.indexOf(`@keyframes ${name}`);
      const body = css.slice(start, css.indexOf("\n}\n", start));
      const props = [...body.matchAll(/^\s+([a-z-]+):/gm)].map((m) => m[1]);
      expect(props.length, name).toBeGreaterThan(0);
      for (const p of props) expect(["opacity", "transform"], `${name}: ${p}`).toContain(p);
    }
  });
});
