import { describe, expect, it } from "vitest";
import { assertPoisha, formatTaka, percentOf, toPoisha } from "@/lib/money";
import { isBdPhone, maskPhone, normalizeBdPhone } from "@/lib/phone";

describe("money (poisha)", () => {
  it("converts taka to integer poisha without float drift", () => {
    expect(toPoisha(1450)).toBe(145000);
    expect(toPoisha(0.1 + 0.2)).toBe(30);
    expect(toPoisha(19.99)).toBe(1999);
  });

  it("formats for display", () => {
    expect(formatTaka(145000)).toBe("৳1,450");
    expect(formatTaka(1999)).toBe("৳19.99");
    expect(formatTaka(5)).toBe("৳0.05");
    expect(formatTaka(-7000)).toBe("-৳70");
  });

  it("rejects non-integer money", () => {
    expect(() => assertPoisha(10.5)).toThrow();
    expect(() => formatTaka(1.1)).toThrow();
  });

  it("calculates percentages rounded to poisha", () => {
    expect(percentOf(100000, 1)).toBe(1000);
    expect(percentOf(12345, 1.5)).toBe(185);
  });
});

describe("Bangladeshi phone numbers", () => {
  it.each([
    ["01712345678", "+8801712345678"],
    ["+8801712345678", "+8801712345678"],
    ["8801912345678", "+8801912345678"],
    ["017-1234-5678", "+8801712345678"],
    ["01312 345678", "+8801312345678"],
  ])("normalises %s", (input, expected) => {
    expect(normalizeBdPhone(input)).toBe(expected);
  });

  it.each(["01212345678", "0171234567", "017123456789", "+14155550100", "abc", ""])("rejects %s", (input) => {
    expect(normalizeBdPhone(input)).toBeNull();
    expect(isBdPhone(input)).toBe(false);
  });

  it("masks for display", () => {
    expect(maskPhone("+8801712345678")).toBe("+88017*****678");
  });
});
