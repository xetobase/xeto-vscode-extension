import { ProtoCompiler } from "../compiler/Compiler";
import { type LibraryManager } from "./LibManager";
import { XetoLib } from "./XetoLib";
import { readXetolib } from "./XetolibReader";

/**
 * Cache of extracted xetolib file content, keyed by URI.
 * Used by the content provider for cmd+click navigation.
 */
export const xetolibContentCache = new Map<string, string>();

/**
 * Read a .xetolib ZIP file, parse its .xeto source files,
 * and register the resulting lib with the LibraryManager.
 *
 * Used by both BundledLibs (priority -1) and workspace scanning (priority 50).
 */
export const loadXetolibIntoManager = (
  filePath: string,
  lm: LibraryManager,
  priority: number
): void => {
  const content = readXetolib(filePath);
  if (content == null) return;

  const { meta, xetoFiles } = content;

  const lib = new XetoLib(
    meta.name,
    meta.version,
    `xeto://xetolib/${meta.name}/lib.xeto`,
    meta.doc
  );
  lib.includePriority = priority;
  lib.addMeta(meta.version, meta.doc, meta.depends);

  for (const [fileName, fileContent] of xetoFiles) {
    const sourceUri = `xeto://xetolib/${meta.name}/${fileName}`;

    // Cache content for cmd+click navigation
    xetolibContentCache.set(sourceUri, fileContent);

    const compiler = new ProtoCompiler(sourceUri);

    try {
      compiler.run(fileContent);
    } catch {
      continue;
    }

    if (compiler.root == null) continue;

    for (const [name, proto] of Object.entries(compiler.root.children)) {
      lib.addChild(name, proto);
    }
  }

  lm.addLib(lib);
};
