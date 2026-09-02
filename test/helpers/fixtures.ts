import * as path from "node:path";
import { LibraryManager } from "../../server/src/libraries/LibManager";
import { loadBundledLibs } from "../../server/src/libraries/BundledLibs";
import { ProtoCompiler } from "../../server/src/compiler/Compiler";
import { type Proto } from "../../server/src/compiler/Proto";

export const repoRoot = path.resolve(__dirname, "../..");
export const bundledLibsPath = path.join(repoRoot, "bundled-libs");

let cachedManager: LibraryManager | null = null;

/** LibraryManager with all real bundled libs loaded (cached per process). */
export const bundledManager = (): LibraryManager => {
  if (cachedManager == null) {
    cachedManager = new LibraryManager();
    loadBundledLibs(bundledLibsPath, cachedManager);
  }
  return cachedManager;
};

/** Compile a source string, asserting is left to the caller. */
export const compile = (src: string, uri = "file:///test.xeto"): ProtoCompiler => {
  const c = new ProtoCompiler(uri);
  c.run(src.endsWith("\n") ? src : src + "\n");
  return c;
};

/** Compile and return the root proto. */
export const compileRoot = (src: string): Proto => {
  const c = compile(src);
  if (c.root == null) throw new Error("compile produced no root");
  return c.root;
};
