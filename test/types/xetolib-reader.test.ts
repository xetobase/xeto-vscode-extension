import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { readXetolib } from "../../server/src/libraries/XetolibReader";
import { bundledLibsPath } from "../helpers/fixtures";

const sysLibPath = path.join(bundledLibsPath, "sys", "sys.xetolib");

describe("readXetolib", () => {
  it("reads the real bundled sys.xetolib", () => {
    expect(fs.existsSync(sysLibPath)).toBe(true);
    const content = readXetolib(sysLibPath);
    expect(content).not.toBeNull();
    expect(content!.meta.name).toBe("sys");
    expect(content!.meta.version).toMatch(/^\d+\.\d+/);
    expect(content!.xetoFiles.size).toBeGreaterThan(0);
  });

  it("excludes lib.xeto from extracted files", () => {
    const content = readXetolib(sysLibPath)!;
    expect(content.xetoFiles.has("lib.xeto")).toBe(false);
  });

  it("parses depends from ph.xetolib", () => {
    const phPath = path.join(bundledLibsPath, "ph", "ph.xetolib");
    const content = readXetolib(phPath)!;
    expect(content.meta.name).toBe("ph");
    expect(content.meta.depends).toContain("sys");
  });

  it("returns null for nonexistent file", () => {
    expect(readXetolib("/does/not/exist.xetolib")).toBeNull();
  });

  it("returns null for a non-zip file", () => {
    const bogus = path.join(__dirname, "xetolib-reader.test.ts");
    expect(readXetolib(bogus)).toBeNull();
  });
});
