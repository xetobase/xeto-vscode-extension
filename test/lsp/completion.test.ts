import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type CompletionItem, type CompletionList } from "vscode-languageserver-protocol/node";
import { startHarness, withCursor, type LspHarness } from "../helpers/lsp-harness";

let h: LspHarness;
beforeAll(async () => { h = await startHarness(); });
afterAll(() => { h.dispose(); });

const labels = (result: CompletionItem[] | CompletionList | null): string[] => {
  if (result == null) return [];
  const items = Array.isArray(result) ? result : result.items;
  return items.map((i) => i.label);
};

const complete = async (src: string): Promise<string[]> => {
  const { text, position } = withCursor(src);
  const uri = await h.openDocument(text);
  return labels(await h.completion(uri, position));
};

describe("completion", () => {
  it("suggests lib children after a `::` qualified path", async () => {
    const out = await complete("Foo: Dict {\n  bar: sys::|\n}\n");
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("Str");
  });

  it("returns visible types for a partial type position", async () => {
    const out = await complete("MyThing: D|\n");
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("Dict");
  });

  it("suggests slots inside a typed dict body", async () => {
    // Spec has known meta slots (abstract, sealed, ...) via sys
    const out = await complete("Foo: Spec {\n  a|\n}\n");
    expect(out.length).toBeGreaterThan(0);
  });
});
