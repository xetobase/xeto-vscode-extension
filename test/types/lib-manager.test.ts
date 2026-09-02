import { describe, it, expect } from "vitest";
import { LibraryManager } from "../../server/src/libraries/LibManager";
import { XetoLib } from "../../server/src/libraries/XetoLib";
import { bundledManager, compileRoot } from "../helpers/fixtures";

const makeLib = (name: string, priority: number, src: string): XetoLib => {
  const lib = new XetoLib(name, "1.0.0", `file:///${name}/lib.xeto`);
  lib.includePriority = priority;
  const root = compileRoot(src);
  for (const [key, proto] of Object.entries(root.children)) {
    lib.addChild(key, proto);
  }
  return lib;
};

describe("priority resolution", () => {
  it("higher priority lib wins for same name", () => {
    const lm = new LibraryManager();
    lm.addLib(makeLib("mylib", 0, "Foo: Dict { low }"));
    lm.addLib(makeLib("mylib", 10, "Foo: Dict { high }"));

    const lib = lm.getLib("mylib")!;
    expect(lib.includePriority).toBe(10);
    expect(lib.rootProto.children.Foo.children.high).toBeDefined();
  });

  it("clearAbovePriority removes only higher priority entries", () => {
    const lm = new LibraryManager();
    lm.addLib(makeLib("mylib", -1, "Foo: Dict { bundled }"));
    lm.addLib(makeLib("mylib", 50, "Foo: Dict { workspace }"));

    lm.clearAbovePriority(-1);
    const lib = lm.getLib("mylib")!;
    expect(lib.includePriority).toBe(-1);
  });

  it("clearAbovePriority removes lib entirely when nothing remains", () => {
    const lm = new LibraryManager();
    lm.addLib(makeLib("gone", 50, "Foo: Dict"));
    lm.clearAbovePriority(-1);
    expect(lm.getLib("gone")).toBeUndefined();
  });

  it("unknown lib returns undefined", () => {
    expect(new LibraryManager().getLib("nope")).toBeUndefined();
  });
});

describe("findProtoByQName against real bundled libs", () => {
  const lm = bundledManager();

  it("loads sys and ph from bundled-libs", () => {
    expect(lm.getLib("sys")).toBeDefined();
    expect(lm.getLib("ph")).toBeDefined();
  });

  it("resolves qualified qname sys::Str", () => {
    const p = lm.findProtoByQName("sys::Str");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("Str");
  });

  it("resolves ph::Point via qualified name", () => {
    const p = lm.findProtoByQName("ph::Point");
    expect(p).not.toBeNull();
  });

  it("unqualified name falls back to sys", () => {
    const p = lm.findProtoByQName("Str");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("Str");
  });

  it("unknown qname returns null", () => {
    expect(lm.findProtoByQName("nolib::Nothing")).toBeNull();
  });
});
