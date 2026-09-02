import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { type TextEdit } from "vscode-languageserver-protocol/node";
import { startHarness, withCursor, type LspHarness } from "../helpers/lsp-harness";

let h: LspHarness;
beforeAll(async () => { h = await startHarness(); });
afterAll(() => { h.dispose(); });

const applyEdits = (text: string, edits: TextEdit[]): string =>
  TextDocument.applyEdits(
    TextDocument.create("file:///x.xeto", "xeto", 1, text),
    edits
  );

describe("formatting", () => {
  it("normalizes indentation to two spaces", async () => {
    const src = "Foo: Dict {\n      bar: Str\n}\n";
    const uri = await h.openDocument(src);
    const edits = await h.format(uri);
    expect(edits).not.toBeNull();
    const out = applyEdits(src, edits!);
    expect(out).toContain("\n  bar: Str");
  });

  it("formatting is idempotent", async () => {
    const src = "Foo: Dict {\n      bar: Str\n  baz:Number\n}\n";
    const uri1 = await h.openDocument(src);
    const once = applyEdits(src, (await h.format(uri1)) ?? []);
    const uri2 = await h.openDocument(once);
    const twice = applyEdits(once, (await h.format(uri2)) ?? []);
    expect(twice).toBe(once);
  });
});

describe("document symbols", () => {
  it("reports top-level specs as symbols", async () => {
    // note: symbols at line 0/col 0 are skipped by generateSymbols,
    // so lead with a comment line
    const uri = await h.openDocument(
      "// specs\nAlpha: Dict { a: Str }\nBeta: Dict\n"
    );
    const symbols = await h.documentSymbols(uri);
    expect(symbols).not.toBeNull();
    const names = (symbols as Array<{ name: string }>).map((s) => s.name);
    expect(names).toContain("Alpha");
    expect(names).toContain("Beta");
  });
});

describe("rename", () => {
  it("renames a type from its declaration, updating references", async () => {
    const src = "// doc\nBa|se: Dict\nSub: Base\n";
    const { text, position } = withCursor(src);
    const uri = await h.openDocument(text);
    const edit = await h.rename(uri, position, "Root");
    expect(edit).not.toBeNull();
    const changes = edit!.changes?.[uri] ?? [];
    expect(changes.length).toBeGreaterThanOrEqual(2); // declaration + reference
    const out = applyEdits(text, changes);
    expect(out).toContain("Root: Dict");
    expect(out).toContain("Sub: Root");
    expect(out).not.toContain("Base");
  });
});
