import { type LibraryManager } from "./LibManager";
import { XetoLib } from "./XetoLib";
import { ProtoCompiler } from "../compiler/Compiler";
import { readUrl } from "./utils";
import { loadXetolibIntoManager } from "./loadXetolib";

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { EVENT_TYPE, eventBus } from "../events";

export const loadExtLib = (
  root: string,
  lm: LibraryManager,
  priority: number
): void => {
  try {
    const files = fs.readdirSync(root, { withFileTypes: true });
    const libName = path.basename(root);
    const rootUri = pathToFileURL(root).toString();

    //	parse the lib file first
    const libXetoContents = fs
      .readFileSync(path.join(root, "lib.xeto"))
      .toString("utf-8");
    const libInfoCompiler = new ProtoCompiler(rootUri);

    libInfoCompiler.run(libXetoContents);

    const libVersion =
      libInfoCompiler.root?.children?.pragma?.children?._version?.type ??
      "unknown";
    const libDoc = libInfoCompiler.root?.children?.pragma?.doc ?? "";

    // Parse deps from pragma (required for cross-lib type resolution)
    const protoDeps =
      libInfoCompiler.root?.children?.pragma?.children?._depends?.children;
    const deps: string[] = [];
    if (protoDeps != null) {
      Object.keys(protoDeps).forEach((key) => {
        if (key.startsWith("#")) return;
        const dep = protoDeps[key].children?.lib?.type;
        if (dep != null) deps.push(dep);
      });
    }

    const lib = new XetoLib(libName, libVersion, rootUri, libDoc);
    lib.includePriority = priority;
    lib.addMeta(libVersion, libDoc, deps);

    //	parse all files
    files
      .filter(
        (file) =>
          file.isFile() &&
          file.name.endsWith("xeto") &&
          file.name !== "lib.xeto"
      )
      .forEach((file) => {
        const filePath = path.join(root, file.name);
        const fileContent = fs.readFileSync(filePath).toString("utf-8");

        const compiler = new ProtoCompiler(pathToFileURL(filePath).toString());
        compiler.run(fileContent);

        if (compiler.root == null) {
          return;
        }

        Object.entries(compiler.root.children).forEach(([name, proto]) => {
          lib.addChild(name, proto);
        });
      });

    lm.addLib(lib);
  } catch (e) {
    console.log(e);
  }
};

const loadExtLibFromWeb = async (
  def: ExtLibDef,
  lm: LibraryManager,
  priority: number
): Promise<void> => {
  const libInfoUri = def.lib;

  const libXeto = await readUrl(libInfoUri);
  const libInfoCompiler = new ProtoCompiler(
    libInfoUri.replace("https://", "xeto://")
  );
  try {
    libInfoCompiler.run(libXeto);
  } catch (e) {
    console.log(e);
  }

  const libVersion =
    libInfoCompiler.root?.children?.pragma?.children?._version?.type ?? "unknown";
  const libDoc = libInfoCompiler.root?.children?.pragma?.doc ?? "";

  const lib = new XetoLib(
    def.name,
    libVersion,
    libInfoUri.replace("https://", "xeto://"),
    libDoc
  );
  lib.includePriority = -1;

  // now that we have the lib read all the files
  const filesPr = def.files.map(async (uri) => {
    const compiler = new ProtoCompiler(uri.replace("https://", "xeto://"));
    const content = await readUrl(uri);
    compiler.run(content + "\0");

    if (compiler.root == null) {
      return;
    }

    Object.entries(compiler.root.children).forEach(([name, proto]) => {
      lib.addChild(name, proto);
    });
  });

  await Promise.all(filesPr);

  lm.addLib(lib);
};

const isFolderLib = (dirPath: string): boolean =>
  fs.existsSync(path.join(dirPath, "lib.xeto"));

export const loadExtLibs = (
  sources: Array<string | ExtLibDef>,
  lm: LibraryManager
): void => {
  sources.forEach((root, index) => {
    try {
      if (typeof root === "string") {
        //	check if we have a single lib or this is a repo of multiple libs
        if (isFolderLib(root)) {
          loadExtLib(root, lm, sources.length - index);
        } else {
          //	check all subdirs for raw source (lib.xeto) or compiled xetolibs
          const entries = fs.readdirSync(root, { withFileTypes: true });
          const priority = sources.length - index;

          entries
            .filter((entry) => entry.isDirectory())
            .forEach((dir) => {
              const dirPath = path.join(root, dir.name);

              if (isFolderLib(dirPath)) {
                loadExtLib(dirPath, lm, priority);
              } else {
                // Check for compiled .xetolib files inside the subdirectory
                const files = fs.readdirSync(dirPath);
                const xetolibFile = files.find((f) => f.endsWith(".xetolib"));
                if (xetolibFile != null) {
                  loadXetolibIntoManager(path.join(dirPath, xetolibFile), lm, priority);
                }
              }
            });
        }
      } else {
        void loadExtLibFromWeb(root, lm, sources.length - index);
      }
    } catch (e) {
      console.log(e);
    }
  });

  eventBus.fire(EVENT_TYPE.EXTERNAL_LIBS_LOADED);
};

export interface ExtLibDef {
  name: string;
  lib: string;
  files: string[];
}
