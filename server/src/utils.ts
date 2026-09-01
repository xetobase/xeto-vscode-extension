import { type Connection } from "vscode-languageserver";
import { fileURLToPath } from "node:url";
import { type CompilerError } from "./compiler/Errors";

export const VARS: {
  env: "BROWSER" | "NODE";
} = {
  env: "BROWSER",
};

export const isPartOfLib = async (
  path: string,
  connection: Connection
): Promise<boolean> => {
  if (VARS.env === "BROWSER") {
    const split = path.split("/");

    return await connection.sendRequest("xfs/exists", {
      path: [...[...split].slice(0, -1), "lib.xeto"].join("/"),
    });
  } else {
    try {
      const fs = await import("fs/promises");
      const osPath = await import("path");

      let libPath: string;
      try { libPath = fileURLToPath(path); } catch { libPath = path; }

      const stat = await fs.stat(
        osPath.join(libPath, "..", "lib.xeto")
      );
      if (stat.isFile()) {
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }
};

/**
 * Walk up from a file's directory looking for the nearest lib.xeto, returning
 * the name of the directory that contains it (the lib name), or null.  Used
 * for data files (.xetod) which may live in a subfolder of their lib (e.g.
 * `<lib>/aura/build.xetod`), where the sibling-only isPartOfLib check fails.
 */
export const findOwningLibName = async (
  path: string,
  connection: Connection,
  maxLevels = 5
): Promise<string | null> => {
  const segments = path.split("/");

  if (VARS.env === "BROWSER") {
    for (let up = 1; up <= maxLevels && segments.length - up - 1 > 0; up++) {
      const dirSegments = segments.slice(0, -up);
      const exists: boolean = await connection.sendRequest("xfs/exists", {
        path: [...dirSegments, "lib.xeto"].join("/"),
      });
      if (exists) return dirSegments[dirSegments.length - 1];
    }
    return null;
  }

  const fs = await import("fs/promises");
  const osPath = await import("path");

  let filePath: string;
  try { filePath = fileURLToPath(path); } catch { filePath = path; }

  let dir = osPath.dirname(filePath);
  for (let up = 0; up < maxLevels; up++) {
    try {
      const stat = await fs.stat(osPath.join(dir, "lib.xeto"));
      if (stat.isFile()) return osPath.basename(dir);
    } catch {
      // no lib.xeto here, keep walking up
    }
    const parent = osPath.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
};

export const isCompilerError = (error: any): error is CompilerError => {
  return "type" in error;
};
