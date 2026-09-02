import { describe, it, expect } from "vitest";
import {
  resolveTypeProto,
  collectVisibleTypes,
  collectSlots,
  collectEnumValues,
  collectMetaTags,
  collectSubtypes,
  findSlotOnType,
  isEnumType,
  isChoiceType,
  isQueryType,
} from "../../server/src/capabilities/spec-utils";
import { bundledManager } from "../helpers/fixtures";

const lm = bundledManager();
const phLib = lm.getLib("ph");
const phPointsLib = lm.getLib("ph.points");

describe("resolveTypeProto (real libs)", () => {
  it("resolves bare sys type as last resort", () => {
    const p = resolveTypeProto("Str", undefined, undefined, lm);
    expect(p?.name).toBe("Str");
  });

  it("resolves a type from a dep lib by simple name", () => {
    // ph.points depends on ph — Point lives in ph
    const p = resolveTypeProto("Point", undefined, phPointsLib, lm);
    expect(p).not.toBeNull();
  });

  it("returns null for empty name", () => {
    expect(resolveTypeProto("", undefined, undefined, lm)).toBeNull();
  });
});

describe("collectVisibleTypes", () => {
  it("includes own lib + deps + sys", () => {
    const types = collectVisibleTypes(phLib, lm);
    const names = types.map((t) => t.name);
    expect(names).toContain("Point"); // own lib
    expect(names).toContain("Str"); // sys implicitly
  });

  it("dedupes by simple name (own lib wins)", () => {
    const types = collectVisibleTypes(phLib, lm);
    const names = types.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("slot collection on real ph types", () => {
  it("collects inherited slots (Site gets dis from Entity chain)", () => {
    const site = resolveTypeProto("Site", undefined, phLib, lm);
    expect(site).not.toBeNull();
    const slots = collectSlots(site!, undefined, phLib, lm);
    expect(slots.length).toBeGreaterThan(0);
    // some slots must be inherited from supertypes
    expect(slots.some((s) => s.inherited)).toBe(true);
  });

  it("findSlotOnType walks the chain", () => {
    const site = resolveTypeProto("Site", undefined, phLib, lm);
    const slots = collectSlots(site!, undefined, phLib, lm);
    const anyInherited = slots.find((s) => s.inherited);
    expect(anyInherited).toBeDefined();
    const found = findSlotOnType(site!, anyInherited!.name, undefined, phLib, lm);
    expect(found).not.toBeNull();
  });

  it("excludes global slots from completions", () => {
    const entity = resolveTypeProto("Entity", undefined, phLib, lm);
    expect(entity).not.toBeNull();
    const slots = collectSlots(entity!, undefined, phLib, lm);
    // no returned slot may carry the `global` marker child
    const globals = slots.filter((s) => {
      const slot = findSlotOnType(entity!, s.name, undefined, phLib, lm);
      return slot?.children.global != null;
    });
    expect(globals).toEqual([]);
  });
});

describe("type classification against sys", () => {
  it("sys Enum-derived types classify as enum", () => {
    const curStatus = resolveTypeProto("CurStatus", undefined, phLib, lm);
    expect(curStatus).not.toBeNull();
    expect(isEnumType(curStatus!, undefined, phLib, lm)).toBe(true);

    const enumBase = resolveTypeProto("Enum", undefined, undefined, lm);
    expect(enumBase).not.toBeNull();
    expect(isEnumType(enumBase!, undefined, undefined, lm)).toBe(true);
  });

  it("Choice base classifies as choice", () => {
    const choice = resolveTypeProto("Choice", undefined, undefined, lm);
    expect(isChoiceType(choice!, undefined, undefined, lm)).toBe(true);
  });

  it("Query base classifies as query", () => {
    const query = resolveTypeProto("Query", undefined, undefined, lm);
    expect(isQueryType(query!, undefined, undefined, lm)).toBe(true);
  });

  it("Str does not classify as enum/choice/query", () => {
    const str = resolveTypeProto("Str", undefined, undefined, lm)!;
    expect(isEnumType(str, undefined, undefined, lm)).toBe(false);
    expect(isChoiceType(str, undefined, undefined, lm)).toBe(false);
    expect(isQueryType(str, undefined, undefined, lm)).toBe(false);
  });
});

describe("collectEnumValues", () => {
  it("collects lowercase children of an enum", () => {
    const curStatus = resolveTypeProto("CurStatus", undefined, phLib, lm);
    expect(curStatus).not.toBeNull();
    const vals = collectEnumValues(curStatus!);
    expect(vals.length).toBeGreaterThan(0);
    expect(vals.every((v) => /^[a-z]/.test(v.name))).toBe(true);
  });
});

describe("collectSubtypes", () => {
  it("finds Point subtypes across visible libs", () => {
    const point = resolveTypeProto("Point", undefined, phLib, lm)!;
    const subs = collectSubtypes(point, undefined, phLib, lm);
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.every((s) => s.name !== "Point")).toBe(true);
  });
});

describe("collectMetaTags", () => {
  it("returns Spec meta tags excluding sealed internals", () => {
    const tags = collectMetaTags(undefined, undefined, lm);
    const names = tags.map((t) => t.name);
    expect(names).toContain("abstract");
    expect(names).not.toContain("id");
  });
});
