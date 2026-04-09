import * as fs from "node:fs";
import * as path from "node:path";
import { type LibraryManager } from "./LibManager";
import { loadExtLib } from "./ExtLibs";
import { loadXetolibIntoManager } from "./loadXetolib";

/**
 * Set of directories already scanned, to avoid duplicate work when
 * multiple fan.props files resolve to overlapping paths.
 */
const scannedDirs = new Set<string>();

/**
 * Scan an ordered list of directories for xeto libraries using the
 * standard Fantom/Xeto conventions:
 *   {dir}/src/xeto/{libName}/   — raw source (directories with lib.xeto)
 *   {dir}/lib/xeto/{libName}/   — compiled xetolibs (.xetolib ZIP files)
 *
 * Mirrors FileRepoScanner.scan() from haxall/src/core/xetoc/fan/repo/FileRepoScanner.fan
 *
 * Source is loaded at higher priority than compiled so it overrides when
 * the same lib exists in both forms. Earlier path entries get higher
 * priority than later ones.
 */
export const scanPathForLibs = (
  dirs: string[],
  lm: LibraryManager
): number => {
  let loaded = 0;

  dirs.forEach((dir, index) => {
    if (scannedDirs.has(dir)) return;
    scannedDirs.add(dir);

    // Priority: earlier in path = higher priority
    // Source (src/xeto) gets +1000 over compiled (lib/xeto) so source always wins
    const basePriority = (dirs.length - index) * 10;

    loaded += scanSrcXeto(dir, lm, basePriority + 1000);
    loaded += scanLibXeto(dir, lm, basePriority);
  });

  return loaded;
};

/**
 * Scan {dir}/src/xeto/ for raw source libraries.
 * Each subdirectory containing a lib.xeto is a library.
 */
const scanSrcXeto = (
  dir: string,
  lm: LibraryManager,
  priority: number
): number => {
  const srcXeto = path.join(dir, "src", "xeto");
  if (!fs.existsSync(srcXeto)) return 0;

  let loaded = 0;

  try {
    const entries = fs.readdirSync(srcXeto, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const libDir = path.join(srcXeto, entry.name);
      const libXeto = path.join(libDir, "lib.xeto");

      if (fs.existsSync(libXeto)) {
        // Skip if lib already loaded at higher priority
        const existing = lm.getLib(entry.name);
        if (existing != null && existing.includePriority >= priority) continue;

        try {
          loadExtLib(libDir, lm, priority);
          loaded++;
        } catch {
          // skip libs that fail to parse
        }
      }
    }
  } catch {
    // src/xeto dir unreadable
  }

  return loaded;
};

/**
 * Scan {dir}/lib/xeto/ for compiled xetolib files.
 * Each subdirectory may contain .xetolib ZIP files.
 */
const scanLibXeto = (
  dir: string,
  lm: LibraryManager,
  priority: number
): number => {
  const libXeto = path.join(dir, "lib", "xeto");
  if (!fs.existsSync(libXeto)) return 0;

  let loaded = 0;

  try {
    const entries = fs.readdirSync(libXeto, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const libDir = path.join(libXeto, entry.name);

      // Skip if lib already loaded at higher priority (source beats compiled)
      const existing = lm.getLib(entry.name);
      if (existing != null && existing.includePriority >= priority) continue;

      try {
        const files = fs.readdirSync(libDir);
        const xetolibFile = files.find((f) => f.endsWith(".xetolib"));

        if (xetolibFile != null) {
          loadXetolibIntoManager(path.join(libDir, xetolibFile), lm, priority);
          loaded++;
        }
      } catch {
        // skip unreadable dirs
      }
    }
  } catch {
    // lib/xeto dir unreadable
  }

  return loaded;
};

/**
 * Clear the scanned dirs tracker.
 * Called when the cache is invalidated (e.g., props file changed).
 */
export const clearScannedDirs = (): void => {
  scannedDirs.clear();
};
