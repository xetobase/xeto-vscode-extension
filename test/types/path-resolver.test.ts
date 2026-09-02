import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  resolveXetoPath,
  clearCache,
} from "../../server/src/libraries/XetoPathResolver";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xeto-path-test-"));
  clearCache();
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  clearCache();
});

describe("resolveXetoPath", () => {
  it("finds xeto.props in an ancestor and parses path=", () => {
    const sibling = path.join(tmp, "other");
    fs.mkdirSync(sibling);
    fs.writeFileSync(path.join(tmp, "xeto.props"), "path=other\n");
    const nested = path.join(tmp, "src", "deep");
    fs.mkdirSync(nested, { recursive: true });

    const result = resolveXetoPath(nested);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("xeto.props");
    expect(result!.workDir).toBe(tmp);
    expect(result!.dirs[0]).toBe(tmp);
    expect(result!.dirs).toContain(sibling);
  });

  it("skips nonexistent path entries", () => {
    fs.writeFileSync(path.join(tmp, "xeto.props"), "path=missing;also-missing\n");
    const result = resolveXetoPath(tmp)!;
    expect(result.dirs).toEqual([tmp]);
  });

  it("prefers xeto.props over fan.props", () => {
    fs.writeFileSync(path.join(tmp, "xeto.props"), "");
    fs.writeFileSync(path.join(tmp, "fan.props"), "");
    expect(resolveXetoPath(tmp)!.mode).toBe("xeto.props");
  });

  it("falls back to fan.props", () => {
    fs.writeFileSync(path.join(tmp, "fan.props"), "");
    expect(resolveXetoPath(tmp)!.mode).toBe("fan.props");
  });

  it("falls back to .git directory", () => {
    fs.mkdirSync(path.join(tmp, ".git"));
    const result = resolveXetoPath(tmp)!;
    expect(result.mode).toBe("git");
    expect(result.dirs).toEqual([tmp]);
  });

  it("caches results per props file", () => {
    fs.writeFileSync(path.join(tmp, "xeto.props"), "");
    const a = resolveXetoPath(tmp);
    const b = resolveXetoPath(tmp);
    expect(a).toBe(b); // same object → cache hit
  });
});
