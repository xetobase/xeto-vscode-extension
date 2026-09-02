import * as path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { readXetolib } from "../../server/src/libraries/XetolibReader";
import { bundledLibsPath } from "../helpers/fixtures";
import { startHarness, type LspHarness } from "../helpers/lsp-harness";

// idempotency over a representative slice of the real corpus: the full sys
// and ph libs (every grammar construct that ships appears in these)
const sample = (): Array<[string, string]> => {
  const out: Array<[string, string]> = [];
  for (const libName of ["sys", "ph"]) {
    const lib = readXetolib(
      path.join(bundledLibsPath, libName, `${libName}.xetolib`)
    );
    if (lib == null) throw new Error(`missing bundled lib ${libName}`);
    for (const [name, content] of lib.xetoFiles) {
      out.push([`${libName}/${name}`, content]);
    }
  }
  return out;
};

let h: LspHarness;
beforeAll(async () => { h = await startHarness(); });
afterAll(() => { h.dispose(); });

const formatOnce = async (text: string, name: string): Promise<string> => {
  const uri = await h.openDocument(text, name.replace(/[/.]/g, "_"));
  const edits = (await h.format(uri)) ?? [];
  return TextDocument.applyEdits(
    TextDocument.create(uri, "xeto", 1, text),
    edits
  );
};

describe("format idempotency over sys + ph", () => {
  it.each(sample())("formatting %s twice is stable", async (name, content) => {
    const once = await formatOnce(content, `${name}-1`);
    const twice = await formatOnce(once, `${name}-2`);
    expect(twice).toBe(once);
  });
});
