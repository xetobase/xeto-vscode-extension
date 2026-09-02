import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type LspHarness } from "../helpers/lsp-harness";

let h: LspHarness;
beforeAll(async () => { h = await startHarness(); });
afterAll(() => { h.dispose(); });

describe("custom requests", () => {
  it("xetolib/content serves extracted bundled lib source", async () => {
    // any sys file uri present in the cache; probe a known one via definition
    const content = await h.request<string | null>("xetolib/content", {
      uri: "xeto://xetolib/sys/types.xeto",
    });
    expect(content).not.toBeNull();
    expect(content!.length).toBeGreaterThan(0);
  });

  it("xetolib/content returns null for unknown uri", async () => {
    const content = await h.request<string | null>("xetolib/content", {
      uri: "xeto://xetolib/nope/nope.xeto",
    });
    expect(content).toBeNull();
  });

  it("xeto/getPathInfo returns null for non-file uri", async () => {
    const info = await h.request("xeto/getPathInfo", {
      uri: "untitled:whatever",
    });
    expect(info).toBeNull();
  });

  it("xeto/getBuildInfo returns null without a uri", async () => {
    const info = await h.request("xeto/getBuildInfo", {});
    expect(info).toBeNull();
  });
});
