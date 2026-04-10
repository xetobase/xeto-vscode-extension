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

export const isCompilerError = (error: any): error is CompilerError => {
  return "type" in error;
};
