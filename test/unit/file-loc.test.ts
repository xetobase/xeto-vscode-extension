import { describe, it, expect } from "vitest";
import { FileLoc } from "../../server/src/compiler/FileLoc";

describe("FileLoc", () => {
  it("defaults line/col/charIndex to 0", () => {
    const loc = new FileLoc("f.xeto");
    expect(loc.line).toBe(0);
    expect(loc.col).toBe(0);
    expect(loc.charIndex).toBe(0);
  });

  it("newWithOffset offsets line and col", () => {
    const base = new FileLoc("f.xeto", 3, 4);
    const off = FileLoc.newWithOffset(base, 1, 2);
    expect(off.file).toBe("f.xeto");
    expect(off.line).toBe(4);
    expect(off.col).toBe(6);
  });

  it("toString includes line and col", () => {
    expect(new FileLoc("f", 1, 2).toString()).toBe("line: 1, col: 2");
  });
});
