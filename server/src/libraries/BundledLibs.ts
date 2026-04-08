import * as fs from "node:fs";
import * as path from "node:path";

import { type LibraryManager } from "./LibManager";
import { loadXetolibIntoManager } from "./loadXetolib";
import { EVENT_TYPE, eventBus } from "../events";

/**
 * Scan a directory of compiled .xetolib files and load each into the LibraryManager.
 *
 * Directory structure expected:
 *   bundled-libs/
 *     sys/sys-5.0.0.xetolib
 *     ph/ph-5.0.0.xetolib
 *     ...
 *
 * Each subdirectory contains a single .xetolib ZIP file.
 */
export const loadBundledLibs = (
  bundledLibsPath: string,
  lm: LibraryManager
): void => {
  try {
    if (!fs.existsSync(bundledLibsPath)) return;

    const dirs = fs.readdirSync(bundledLibsPath, { withFileTypes: true });

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;

      const dirPath = path.join(bundledLibsPath, dir.name);
      const files = fs.readdirSync(dirPath);
      const xetolibFile = files.find((f) => f.endsWith(".xetolib"));

      if (xetolibFile == null) continue;

      const filePath = path.join(dirPath, xetolibFile);
      loadXetolibIntoManager(filePath, lm, -1);
    }
  } catch (e) {
    console.error("Failed to load bundled libs:", e);
  }

  eventBus.fire(EVENT_TYPE.BUNDLED_LIBS_LOADED);
};
