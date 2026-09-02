import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect } from "vitest";
import { repoRoot } from "../helpers/fixtures";

const read = (rel: string): string =>
  fs.readFileSync(path.join(repoRoot, rel), "utf-8");

const manifest = JSON.parse(read("package.json"));
const clientSrc = read("client/src/extension.ts");
const browserSrc = read("client/src/browserExtension.ts");

describe("manifest: languages & grammars", () => {
  it("maps .xeto and .xetod to the xeto language", () => {
    const xeto = manifest.contributes.languages.find(
      (l: { id: string }) => l.id === "xeto"
    );
    expect(xeto.extensions).toContain(".xeto");
    expect(xeto.extensions).toContain(".xetod");
  });

  it("every declared grammar/config file exists and is valid JSON", () => {
    const files: string[] = [
      ...manifest.contributes.grammars.map((g: { path: string }) => g.path),
      ...manifest.contributes.languages
        .map((l: { configuration?: string }) => l.configuration)
        .filter(Boolean),
    ];
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(() => JSON.parse(read(f))).not.toThrow();
    }
  });

  it("entry points declared in main/browser exist after compile", () => {
    // main: ./client/out/extension  browser: ./client/dist/browserClientMain
    expect(fs.existsSync(path.join(repoRoot, `${manifest.main}.js`))).toBe(true);
    expect(
      fs.existsSync(path.join(repoRoot, `${manifest.browser}.js`))
    ).toBe(true);
  });
});

describe("manifest: commands", () => {
  it("every declared command is registered in the client source", () => {
    for (const cmd of manifest.contributes.commands) {
      expect(clientSrc).toContain(`registerCommand("${cmd.command}"`);
    }
  });
});

describe("manifest: semantic tokens", () => {
  it("declared custom token types appear in both client legends", () => {
    for (const t of manifest.contributes.semanticTokenTypes) {
      expect(clientSrc).toContain(`"${t.id}"`);
      expect(browserSrc).toContain(`"${t.id}"`);
    }
  });

  it("semanticTokenScopes covers every declared token type", () => {
    const scoped = Object.keys(manifest.contributes.semanticTokenScopes[0].scopes);
    for (const t of manifest.contributes.semanticTokenTypes) {
      expect(scoped).toContain(t.id);
    }
  });
});
