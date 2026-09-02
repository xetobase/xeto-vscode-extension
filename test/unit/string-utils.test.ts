import { describe, it, expect } from "vitest";
import {
  isAlpha,
  isLower,
  isNumeric,
  isAlphaNumeric,
  toHex,
  toCode,
  trimToNull,
  isIdChar,
} from "../../server/src/compiler/StringUtils";

describe("isAlpha / isLower / isNumeric / isAlphaNumeric", () => {
  it("classifies letters", () => {
    expect(isAlpha("a")).toBe(true);
    expect(isAlpha("Z")).toBe(true);
    expect(isAlpha("1")).toBe(false);
    expect(isLower("a")).toBe(true);
    expect(isLower("A")).toBe(false);
  });

  it("classifies digits", () => {
    expect(isNumeric("0")).toBe(true);
    expect(isNumeric("9")).toBe(true);
    expect(isNumeric("a")).toBe(false);
  });

  it("alphanumeric union", () => {
    expect(isAlphaNumeric("a")).toBe(true);
    expect(isAlphaNumeric("5")).toBe(true);
    expect(isAlphaNumeric("_")).toBe(false);
  });
});

describe("toHex / toCode", () => {
  it("hex of char", () => {
    expect(toHex("A")).toBe("41");
  });

  it("quotes printable chars", () => {
    expect(toCode("#", "'")).toBe("'#'");
  });

  it("escapes control chars", () => {
    expect(toCode("\u0001", "'")).toBe("'\\u001'");
  });
});

describe("trimToNull", () => {
  it("trims to content", () => {
    expect(trimToNull("  x ")).toBe("x");
  });
  it("empty → null", () => {
    expect(trimToNull("   ")).toBeNull();
  });
});

describe("isIdChar", () => {
  it("accepts id chars", () => {
    for (const c of ["a", "Z", "0", "_", ":", "-", ".", "~"]) {
      expect(isIdChar(c)).toBe(true);
    }
  });
  it("rejects others", () => {
    for (const c of ["@", " ", "{", "\u00e9"]) {
      expect(isIdChar(c)).toBe(false);
    }
  });
});
