import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Result of resolving the xeto environment path for a given file.
 */
export interface XetoPathResult {
  /** How the path was resolved: "xeto.props", "fan.props", "git", or "fallback" */
  mode: string;
  /** The directory where the props file (or .git) was found */
  workDir: string;
  /** Ordered list of directories to scan for libs */
  dirs: string[];
}

/**
 * Cache of resolved paths keyed by the props file (or workDir) path.
 * Prevents re-resolving when multiple files in the same repo are opened.
 */
const resolvedCache = new Map<string, XetoPathResult>();

/**
 * Walk up from startDir looking for the nearest xeto.props, fan.props, or .git.
 * Returns the resolved XetoPathResult, or null if nothing found.
 *
 * Mirrors ServerEnv.initPath() from haxall/src/core/xetoc/fan/repo/ServerEnv.fan
 */
export const resolveXetoPath = (startDir: string): XetoPathResult | null => {
  // Try xeto.props first, then fan.props, then .git
  const xetoPropsDir = findAncestorWith(startDir, "xeto.props");
  if (xetoPropsDir != null) {
    const cacheKey = path.join(xetoPropsDir, "xeto.props");
    const cached = resolvedCache.get(cacheKey);
    if (cached != null) return cached;

    const dirs = parsePropsPath(xetoPropsDir, "xeto.props");
    const result: XetoPathResult = { mode: "xeto.props", workDir: xetoPropsDir, dirs };
    resolvedCache.set(cacheKey, result);
    return result;
  }

  const fanPropsDir = findAncestorWith(startDir, "fan.props");
  if (fanPropsDir != null) {
    const cacheKey = path.join(fanPropsDir, "fan.props");
    const cached = resolvedCache.get(cacheKey);
    if (cached != null) return cached;

    const dirs = parsePropsPath(fanPropsDir, "fan.props");
    const result: XetoPathResult = { mode: "fan.props", workDir: fanPropsDir, dirs };
    resolvedCache.set(cacheKey, result);
    return result;
  }

  const gitDir = findAncestorWith(startDir, ".git");
  if (gitDir != null) {
    const cacheKey = path.join(gitDir, ".git");
    const cached = resolvedCache.get(cacheKey);
    if (cached != null) return cached;

    const result: XetoPathResult = { mode: "git", workDir: gitDir, dirs: [gitDir] };
    resolvedCache.set(cacheKey, result);
    return result;
  }

  return null;
};

/**
 * Invalidate cached results for a specific props file path.
 * Called when a props file changes on disk.
 */
export const invalidateCache = (propsFilePath: string): void => {
  resolvedCache.delete(propsFilePath);
};

/**
 * Clear the entire resolution cache.
 */
export const clearCache = (): void => {
  resolvedCache.clear();
};

/**
 * Walk up from startDir looking for a file or directory with the given name.
 * Returns the directory containing it, or null if not found.
 *
 * Mirrors ServerEnv.findWorkDir() — no artificial boundary at the workspace root.
 */
const findAncestorWith = (startDir: string, name: string): string | null => {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (true) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return dir;

    const parent = path.dirname(dir);
    if (parent === dir || dir === root) return null;
    dir = parent;
  }
};

/**
 * Parse a props file and resolve the path= line into an ordered list of directories.
 *
 * The props file format:
 *   path=../studio;../haxall;../xeto
 *   // comments are ignored
 *   env.KEY=value  (ignored)
 *
 * Paths are semicolon-separated and resolved relative to the directory
 * containing the props file. The workDir itself is always included as
 * the first entry in the returned list.
 */
const parsePropsPath = (workDir: string, propsFileName: string): string[] => {
  const filePath = path.join(workDir, propsFileName);
  const dirs: string[] = [workDir];

  try {
    const content = fs.readFileSync(filePath, "utf-8");

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("path=")) continue;

      const pathValue = trimmed.substring("path=".length);
      const entries = pathValue.split(";");

      for (const entry of entries) {
        const cleaned = entry.trim();
        if (cleaned.length === 0) continue;

        const resolved = path.resolve(workDir, cleaned);
        if (!dirs.includes(resolved) && fs.existsSync(resolved)) {
          dirs.push(resolved);
        }
      }

      break; // only process the first path= line
    }
  } catch {
    // props file unreadable, just return workDir
  }

  return dirs;
};
