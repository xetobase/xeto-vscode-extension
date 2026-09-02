import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type LspHarness } from "../helpers/lsp-harness";

let h: LspHarness;

beforeAll(async () => {
  h = await startHarness();
});

afterAll(() => {
  h.dispose();
});

describe("lsp harness smoke", () => {
  it("initializes, opens a valid doc, gets zero diagnostics", async () => {
    const uri = await h.openDocument("Foo: Dict { bar: Str }\n");
    expect(h.diagnostics(uri)).toEqual([]);
  });

  it("reports diagnostics for a broken doc", async () => {
    const uri = await h.openDocument("Foo: {\n");
    expect(h.diagnostics(uri).length).toBeGreaterThan(0);
  });
});
