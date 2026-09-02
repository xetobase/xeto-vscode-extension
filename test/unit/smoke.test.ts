import { describe, it, expect } from "vitest";
import { ProtoCompiler } from "../../server/src/compiler/Compiler";

describe("smoke", () => {
  it("compiles a trivial xeto spec with no errors", () => {
    const compiler = new ProtoCompiler("file:///smoke.xeto");
    compiler.run("Foo: Dict { bar: Str }\n");
    expect(compiler.errs).toHaveLength(0);
    expect(compiler.root).not.toBeNull();
  });
});
