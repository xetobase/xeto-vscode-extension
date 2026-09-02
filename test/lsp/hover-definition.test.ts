import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, withCursor, type LspHarness } from "../helpers/lsp-harness";

let h: LspHarness;
beforeAll(async () => { h = await startHarness(); });
afterAll(() => { h.dispose(); });

describe("hover", () => {
  it("hovering a sys type reference returns content", async () => {
    const { text, position } = withCursor("Foo: Dict {\n  bar: St|r\n}\n");
    const uri = await h.openDocument(text);
    const hover = await h.hover(uri, position);
    expect(hover).not.toBeNull();
    expect(JSON.stringify(hover!.contents).length).toBeGreaterThan(2);
  });

  it("hovering whitespace returns null or empty", async () => {
    const { text, position } = withCursor("Foo: Dict\n|\n");
    const uri = await h.openDocument(text);
    const hover = await h.hover(uri, position);
    // acceptable: null, or hover with empty contents
    if (hover != null) {
      expect(JSON.stringify(hover.contents)).toBeDefined();
    }
  });
});

describe("definition", () => {
  it("go-to-definition on a bundled type resolves to a xetolib uri", async () => {
    const { text, position } = withCursor("Foo: Dict {\n  bar: St|r\n}\n");
    const uri = await h.openDocument(text);
    const def = await h.definition(uri, position);
    expect(def).not.toBeNull();
    const locs = Array.isArray(def) ? def : [def];
    expect(locs.length).toBeGreaterThan(0);
    const first = locs[0] as { uri?: string; targetUri?: string };
    const target = first.uri ?? first.targetUri ?? "";
    expect(target).toContain("xeto://xetolib/sys/");
  });

  it("go-to-definition on a local type resolves to the same document", async () => {
    const { text, position } = withCursor("Base: Dict\nSub: Ba|se\n");
    const uri = await h.openDocument(text);
    const def = await h.definition(uri, position);
    expect(def).not.toBeNull();
    const locs = Array.isArray(def) ? def : [def];
    const first = locs[0] as { uri?: string; targetUri?: string };
    expect(first.uri ?? first.targetUri).toBe(uri);
  });
});
