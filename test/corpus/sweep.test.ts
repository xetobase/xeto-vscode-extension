import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect } from "vitest";
import { readXetolib } from "../../server/src/libraries/XetolibReader";
import { compile, bundledLibsPath } from "../helpers/fixtures";

/**
 * Corpus sources:
 *  - default: every .xeto source inside every bundled .xetolib (real sys/ph/g36)
 *  - optional: XETO_CORPUS=";"-or-","-separated dirs swept recursively
 */

interface CorpusFile {
  name: string;
  content: string;
}

const bundledCorpus = (): CorpusFile[] => {
  const out: CorpusFile[] = [];
  for (const entry of fs.readdirSync(bundledLibsPath)) {
    const dir = path.join(bundledLibsPath, entry);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".xetolib")) continue;
      const lib = readXetolib(path.join(dir, f));
      if (lib == null) continue;
      for (const [name, content] of lib.xetoFiles) {
        out.push({ name: `${entry}/${name}`, content });
      }
    }
  }
  return out;
};

const externalCorpus = (): CorpusFile[] => {
  const env = process.env.XETO_CORPUS;
  if (env == null || env.length === 0) return [];
  const out: CorpusFile[] = [];
  const collect = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full);
      else if (/\.xetod?$/.test(entry.name)) {
        out.push({ name: full, content: fs.readFileSync(full, "utf-8") });
      }
    }
  };
  for (const dir of env.split(/[;,]/).map((s) => s.trim()).filter(Boolean)) {
    if (fs.existsSync(dir)) collect(dir);
    else console.warn(`XETO_CORPUS: skipping missing dir ${dir}`);
  }
  return out;
};

const corpus = [...bundledCorpus(), ...externalCorpus()];

describe(`corpus parse sweep (${corpus.length} files)`, () => {
  it("has a non-empty corpus", () => {
    expect(corpus.length).toBeGreaterThan(0);
  });

  it.each(corpus.map((f) => [f.name, f] as const))(
    "parses %s without errors",
    (_name, file) => {
      const c = compile(file.content, `file:///${file.name}`);
      expect(
        c.errs.map((e) => `[${e.loc?.line}:${e.loc?.col}] ${e.message}`)
      ).toEqual([]);
    }
  );
});
