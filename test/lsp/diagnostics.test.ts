import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type LspHarness } from "../helpers/lsp-harness";

let h: LspHarness;
beforeAll(async () => { h = await startHarness(); });
afterAll(() => { h.dispose(); });

describe("diagnostics", () => {
  it("valid lib source produces no diagnostics", async () => {
    const uri = await h.openDocument(
      "// a doc\nAhu: Dict {\n  dis: Str\n  points: Query\n}\n"
    );
    expect(h.diagnostics(uri)).toEqual([]);
  });

  it("unclosed brace produces an error with a real range", async () => {
    const uri = await h.openDocument("Foo: Dict {\n  bar: Str\n");
    const diags = h.diagnostics(uri);
    expect(diags.length).toBeGreaterThan(0);
    const d = diags[0];
    expect(d.message.length).toBeGreaterThan(0);
    expect(d.range.start.line).toBeGreaterThanOrEqual(0);
    expect(d.range.end.line).toBeGreaterThanOrEqual(d.range.start.line);
  });

  it("unterminated string produces an error", async () => {
    const uri = await h.openDocument('Foo: Dict { bar: "unterminated }\n');
    expect(h.diagnostics(uri).length).toBeGreaterThan(0);
  });
});
