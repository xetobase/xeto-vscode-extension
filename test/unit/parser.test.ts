import { describe, it, expect } from "vitest";
import { ProtoCompiler } from "../../server/src/compiler/Compiler";
import { type Proto } from "../../server/src/compiler/Proto";

const compile = (src: string): ProtoCompiler => {
  const c = new ProtoCompiler("file:///test.xeto");
  c.run(src.endsWith("\n") ? src : src + "\n");
  return c;
};

const rootChild = (src: string, name: string): Proto => {
  const c = compile(src);
  expect(c.errs).toHaveLength(0);
  const p = c.root?.children[name];
  expect(p).toBeDefined();
  return p as Proto;
};

describe("top-level specs", () => {
  it("simple spec with type", () => {
    const p = rootChild("Foo: Dict", "Foo");
    expect(p.name).toBe("Foo");
    expect(p.type).toBe("Dict");
  });

  it("spec with slots", () => {
    const p = rootChild("Foo: Dict { bar: Str, baz: Number }", "Foo");
    expect(p.children.bar?.type).toBe("Str");
    expect(p.children.baz?.type).toBe("Number");
  });

  it("nested slots", () => {
    const p = rootChild("Foo: Dict { inner: Dict { deep: Str } }", "Foo");
    expect(p.children.inner?.children.deep?.type).toBe("Str");
  });

  it("marker-only slot", () => {
    const p = rootChild("Foo: Dict { marker }", "Foo");
    expect(p.children.marker).toBeDefined();
  });

  it("multiple top-level specs", () => {
    const c = compile("Foo: Dict\nBar: Str\n");
    expect(c.errs).toHaveLength(0);
    expect(c.root?.children.Foo).toBeDefined();
    expect(c.root?.children.Bar).toBeDefined();
  });

  it("qualified type name", () => {
    const p = rootChild("Foo: sys::Dict", "Foo");
    expect(p.type).toContain("Dict");
  });
});

describe("type expressions", () => {
  it("maybe type", () => {
    const c = compile("Foo: Dict { bar: Str? }");
    expect(c.errs).toHaveLength(0);
  });

  it("and type", () => {
    const c = compile("Foo: A & B");
    expect(c.errs).toHaveLength(0);
  });

  it("or type", () => {
    const c = compile("Foo: A | B");
    expect(c.errs).toHaveLength(0);
  });
});

describe("meta", () => {
  it("spec meta", () => {
    const c = compile("Foo: Dict <abstract>");
    expect(c.errs).toHaveLength(0);
  });

  it("slot meta with value", () => {
    const c = compile('Foo: Dict { bar: Str <pattern: "x+"> }');
    expect(c.errs).toHaveLength(0);
  });
});

describe("scalar values", () => {
  it("string default", () => {
    const c = compile('Foo: Dict { bar: Str "hello" }');
    expect(c.errs).toHaveLength(0);
  });

  it("number with unit", () => {
    const c = compile("Foo: Dict { temp: Number 75 }");
    expect(c.errs).toHaveLength(0);
  });
});

describe("data instances", () => {
  it("named instance dict", () => {
    const c = compile('@foo: { dis: "Foo" }');
    expect(c.errs).toHaveLength(0);
  });
});

describe("docs", () => {
  it("leading doc comment attaches to spec", () => {
    const p = rootChild("// my doc\nFoo: Dict", "Foo");
    expect(p.doc).toContain("my doc");
  });
});

describe("errors", () => {
  it("unclosed brace produces error", () => {
    const c = compile("Foo: Dict { bar: Str");
    expect(c.errs.length).toBeGreaterThan(0);
  });

  it("error carries a location", () => {
    const c = compile("Foo: Dict { bar: Str");
    const err = c.errs[0];
    expect(err.loc).toBeDefined();
    expect(err.loc.line).toBeGreaterThanOrEqual(0);
  });

  it("unclosed string produces error", () => {
    const c = compile('Foo: Dict { bar: Str "oops }');
    expect(c.errs.length).toBeGreaterThan(0);
  });

  it("empty input compiles clean", () => {
    const c = compile("\n");
    expect(c.errs).toHaveLength(0);
  });
});

describe("qname lookup", () => {
  it("getQNameByLocation finds nested proto", () => {
    const c = compile("Foo: Dict { bar: Str }");
    const foo = c.root?.children.Foo;
    expect(foo).toBeDefined();
    const loc = foo!.loc;
    expect(
      c.getQNameByLocation({ line: loc.line, character: loc.col })
    ).toBe("Foo");
  });
});
