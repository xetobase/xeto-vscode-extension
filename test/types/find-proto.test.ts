import { describe, it, expect } from "vitest";
import {
  findProtoByQname,
  findChildrenOf,
  findRefsToProto,
} from "../../server/src/FindProto";
import { bundledManager, compileRoot } from "../helpers/fixtures";

describe("findProtoByQname (local tree)", () => {
  const root = compileRoot("Foo: Dict { bar: Dict { baz: Str } }");

  it("empty qname returns root", () => {
    expect(findProtoByQname("", root)).toBe(root);
  });

  it("finds nested protos by dotted qname", () => {
    expect(findProtoByQname("Foo", root)?.name).toBe("Foo");
    expect(findProtoByQname("Foo.bar", root)?.name).toBe("bar");
    expect(findProtoByQname("Foo.bar.baz", root)?.type).toBe("Str");
  });

  it("returns null for unknown qname", () => {
    expect(findProtoByQname("Nope", root)).toBeNull();
    expect(findProtoByQname("Foo.nope", root)).toBeNull();
  });
});

describe("findProtoByQname (real sys lib)", () => {
  const sys = bundledManager().getLib("sys")!;

  it("finds Str in sys root", () => {
    expect(findProtoByQname("Str", sys.rootProto)?.name).toBe("Str");
  });
});

describe("findChildrenOf", () => {
  it("lists direct children, excluding meta keys", () => {
    const root = compileRoot("Foo: Dict { bar: Str, baz: Number }");
    const children = findChildrenOf("Foo", root);
    const labels = children.map((c) => c.label);
    expect(labels).toContain("bar");
    expect(labels).toContain("baz");
    expect(labels.every((l) => !l.startsWith("_"))).toBe(true);
  });

  it("handles trailing dot", () => {
    const root = compileRoot("Foo: Dict { bar: Str }");
    expect(findChildrenOf("Foo.", root).map((c) => c.label)).toContain("bar");
  });
});

describe("findRefsToProto", () => {
  it("finds protos typed against a qname", () => {
    const root = compileRoot("Foo: Dict\nBar: Foo\nBaz: Str");
    const refs = findRefsToProto("Foo", root);
    expect(refs.some((r) => r.name === "Bar")).toBe(true);
    expect(refs.some((r) => r.name === "Baz")).toBe(false);
  });
});
