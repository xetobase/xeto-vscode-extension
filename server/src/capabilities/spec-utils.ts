import { findProtoByQname } from "../FindProto";
import { type Proto } from "../compiler/Proto";
import { type LibraryManager, type XetoLib } from "../libraries";

/// ///////////////////////////////////////////////////////////////////////
// Spec type system utilities
//
// The engine that understands the Xeto type system: resolving type names to
// protos, walking the supertype chain (including And/Or compounds), and
// collecting slots / subtypes / enum values.  Driven purely by walking the
// spec tree -- no special cases per lib.  Shared by autocompletion and
// go-to-definition.
/// ///////////////////////////////////////////////////////////////////////

export interface SlotInfo {
  name: string;
  doc?: string;
  typeName: string;
  optional: boolean;
  isMarker: boolean;
  hasSlots: boolean;
  // false for slots declared directly on the target type, true for slots
  // inherited from a supertype
  inherited: boolean;
  // name of the type that declared this slot (for display)
  declaredBy: string;
}

export interface TypeInfo {
  name: string;
  doc?: string;
  lib: string;
}

/** Names prefixed with `_` or `#` are parser-internal, not real slots. */
const realSlotName = (name: string): boolean =>
  !name.startsWith("_") && !name.startsWith("#");

const isTypeName = (name: string): boolean =>
  /^[A-Z]/.test(name) && realSlotName(name);

/**
 * Global slots (declared with a `*` prefix, e.g. `*ahu: Marker` on PhEntity)
 * are ontology-wide tag definitions, not instance slots.  The parser records
 * them by attaching a `global` child marker.  These should never appear as
 * slot completions -- a base type like PhEntity declares 500+ of them.
 */
const isGlobalSlot = (slot: Proto): boolean => slot.children.global != null;

/// ///////////////////////////////////////////////////////////////////////
// Type resolution
/// ///////////////////////////////////////////////////////////////////////

/** Resolve a type name to its Proto, searching local file, own lib, then deps. */
export function resolveTypeProto(
  typeName: string,
  localRoot: Proto | undefined,
  lib: XetoLib | undefined,
  libManager: LibraryManager
): Proto | null {
  if (!typeName) return null;

  // for a bare type name (e.g. "Button") we must search dep libs by simple
  // name -- libManager.findProtoByQName treats an unqualified name as a lib
  // name, which is wrong for a type ref.
  const isQualified = typeName.includes("::");
  const simpleName = typeName.includes(".")
    ? typeName.slice(typeName.lastIndexOf(".") + 1)
    : typeName;

  // local file first
  if (localRoot != null) {
    const p = findProtoByQname(typeName, localRoot);
    if (p != null) return p;
  }

  // own lib
  if (lib != null) {
    const p = findProtoByQname(simpleName, lib.rootProto);
    if (p != null) return p;
  }

  // qualified names can be resolved directly by the manager
  if (isQualified) {
    const p = libManager.findProtoByQName(typeName, lib?.deps);
    if (p != null) return p;
  }

  // bare type name: search each dependency lib's root by simple name
  for (const depName of lib?.deps ?? []) {
    const depLib = libManager.getLib(depName);
    if (depLib == null) continue;
    const p = findProtoByQname(simpleName, depLib.rootProto);
    if (p != null) return p;
  }

  // last resort: sys
  const sysLib = libManager.getLib("sys");
  if (sysLib != null) {
    const p = findProtoByQname(simpleName, sysLib.rootProto);
    if (p != null) return p;
  }

  return null;
}

/** Collect all top-level type names from a lib's rootProto. */
function typesFromLib(lib: XetoLib): TypeInfo[] {
  const out: TypeInfo[] = [];
  for (const [name, proto] of Object.entries(lib.rootProto.children)) {
    if (!isTypeName(name)) continue;
    out.push({ name, doc: proto.doc, lib: lib.name });
  }
  return out;
}

/**
 * Collect all type names visible to a file: the file's own lib plus every
 * dependency lib.  Deduped by simple name (own lib wins).
 */
export function collectVisibleTypes(
  lib: XetoLib | undefined,
  libManager: LibraryManager
): TypeInfo[] {
  const out: TypeInfo[] = [];
  const seen = new Set<string>();

  const add = (types: TypeInfo[]): void => {
    for (const t of types) {
      if (seen.has(t.name)) continue;
      seen.add(t.name);
      out.push(t);
    }
  };

  if (lib != null) add(typesFromLib(lib));

  for (const depName of lib?.deps ?? []) {
    const depLib = libManager.getLib(depName);
    if (depLib != null) add(typesFromLib(depLib));
  }

  // sys is always implicitly visible
  if (lib == null || !(lib.deps ?? []).includes("sys")) {
    const sysLib = libManager.getLib("sys");
    if (sysLib != null) add(typesFromLib(sysLib));
  }

  return out;
}

/// ///////////////////////////////////////////////////////////////////////
// Supertype walking
/// ///////////////////////////////////////////////////////////////////////

/**
 * Ascend from a type proto to its *direct* supertypes.  Most types have a
 * single parent, but And/Or types (`A & B`) have several -- their constituent
 * types are stored as the indexed children of the `_of` child.  Returns an
 * empty array at the top of the chain.
 */
function superTypes(
  cur: Proto,
  localRoot: Proto | undefined,
  lib: XetoLib | undefined,
  libManager: LibraryManager
): Proto[] {
  // And/Or compound: the constituent types are stored under `_of`, which the
  // parser materializes as `_of -> children(wrapper) -> "0","1",...`.  Each
  // indexed child's `type` is the constituent type name (e.g. Label, Clickable).
  if (cur.type === "sys.And" || cur.type === "sys.Or") {
    const wrapper = cur.children._of?.children?.children;
    if (wrapper == null) return [];
    const out: Proto[] = [];
    for (const [k, child] of Object.entries(wrapper.children)) {
      if (!realSlotName(k)) continue;
      const resolved = resolveTypeProto(child.type, localRoot, lib, libManager);
      if (resolved != null) out.push(resolved);
    }
    return out;
  }

  if (cur.refType != null) return [cur.refType];
  if (cur.hasRefType) {
    const p = resolveTypeProto(cur.type, localRoot, lib, libManager);
    if (p != null) return [p];
  }
  return [];
}

/**
 * Breadth-first walk of a type and all its ancestors, deduped by name,
 * invoking `visit` for each.  And/Or types branch into multiple parents.
 * `visit` returning `true` stops the walk early and returns `true`.
 */
function walkSupertypes(
  start: Proto,
  localRoot: Proto | undefined,
  lib: XetoLib | undefined,
  libManager: LibraryManager,
  visit: (p: Proto, depth: number) => boolean
): boolean {
  const seen = new Set<string>();
  let level: Proto[] = [start];
  let depth = 0;

  while (level.length > 0) {
    const next: Proto[] = [];
    for (const cur of level) {
      if (seen.has(cur.name)) continue;
      seen.add(cur.name);
      if (visit(cur, depth)) return true;
      next.push(...superTypes(cur, localRoot, lib, libManager));
    }
    level = next;
    depth++;
  }
  return false;
}

/**
 * The type and all its ancestors as a flat list (breadth-first, deduped),
 * each paired with its inheritance depth (0 = the type itself).
 */
function selfAndSupertypes(
  start: Proto,
  localRoot: Proto | undefined,
  lib: XetoLib | undefined,
  libManager: LibraryManager
): Array<{ proto: Proto; depth: number }> {
  const out: Array<{ proto: Proto; depth: number }> = [];
  walkSupertypes(start, localRoot, lib, libManager, (proto, depth) => {
    out.push({ proto, depth });
    return false;
  });
  return out;
}

/** Does the type's chain reach a proto matching `pred`? */
function chainMatches(
  start: Proto,
  localRoot: Proto | undefined,
  lib: XetoLib | undefined,
  libManager: LibraryManager,
  pred: (p: Proto) => boolean
): boolean {
  return walkSupertypes(start, localRoot, lib, libManager, (p) => pred(p));
}

/** Build an `isXType` predicate for a given sys base type. */
const sysTypeTest =
  (typeQName: string, simpleName: string) =>
  (
    typeProto: Proto,
    localRoot: Proto | undefined,
    lib: XetoLib | undefined,
    libManager: LibraryManager
  ): boolean =>
    chainMatches(
      typeProto,
      localRoot,
      lib,
      libManager,
      (p) => p.type === typeQName || p.name === simpleName
    );

/** Is this proto an Enum (walks the supertype chain to sys.Enum)? */
export const isEnumType = sysTypeTest("sys.Enum", "Enum");

/** Is this proto a Query (walks the supertype chain to sys.Query)? */
export const isQueryType = sysTypeTest("sys.Query", "Query");

/** Is this proto a Choice (walks the supertype chain to sys.Choice)? */
export const isChoiceType = sysTypeTest("sys.Choice", "Choice");

/**
 * Collect the concrete subtypes of a base type across all visible libs.
 * Used for both Query `of` constraints (e.g. all Point subtypes) and Choices
 * (e.g. all AhuZoneDelivery variants) -- the valid values for a slot.
 */
export function collectSubtypes(
  baseProto: Proto,
  localRoot: Proto | undefined,
  lib: XetoLib | undefined,
  libManager: LibraryManager
): TypeInfo[] {
  const out: TypeInfo[] = [];
  for (const t of collectVisibleTypes(lib, libManager)) {
    if (t.name === baseProto.name) continue;
    const proto = resolveTypeProto(t.name, localRoot, lib, libManager);
    if (proto == null) continue;
    const isSub = chainMatches(
      proto,
      localRoot,
      lib,
      libManager,
      (p) => p.name === baseProto.name
    );
    if (isSub) out.push(t);
  }
  return out;
}

/// ///////////////////////////////////////////////////////////////////////
// Slot collection
/// ///////////////////////////////////////////////////////////////////////

/** Get the underlying type name of a slot, unwrapping Maybe. */
function slotTypeName(slot: Proto): { typeName: string; optional: boolean } {
  if (slot.type === "sys.Maybe") {
    return { typeName: slot.children._of?.type ?? "", optional: true };
  }
  return { typeName: slot.type ?? "", optional: false };
}

/** Find a slot on a type, walking the inheritance chain. */
export function findSlotOnType(
  typeProto: Proto,
  slotName: string,
  localRoot: Proto | undefined,
  lib: XetoLib | undefined,
  libManager: LibraryManager
): Proto | null {
  for (const { proto } of selfAndSupertypes(
    typeProto,
    localRoot,
    lib,
    libManager
  )) {
    if (proto.children[slotName] != null) return proto.children[slotName];
  }
  return null;
}

/** Resolve a named slot's type proto on a given type (walking inheritance). */
export function resolveSlotType(
  typeProto: Proto,
  slotName: string,
  localRoot: Proto | undefined,
  lib: XetoLib | undefined,
  libManager: LibraryManager
): Proto | null {
  const slot = findSlotOnType(typeProto, slotName, localRoot, lib, libManager);
  if (slot == null) return null;
  return resolveTypeProto(slotTypeName(slot).typeName, localRoot, lib, libManager);
}

/**
 * Resolve the `of` constraint of a named slot on a type (walking inheritance).
 * E.g. for `Ahu.points` (a `Query<of:Point>`) this returns the `Point` proto.
 * Returns null if the slot has no `of` meta.
 */
export function resolveSlotOf(
  typeProto: Proto,
  slotName: string,
  localRoot: Proto | undefined,
  lib: XetoLib | undefined,
  libManager: LibraryManager
): Proto | null {
  const slot = findSlotOnType(typeProto, slotName, localRoot, lib, libManager);
  if (slot == null) return null;
  return resolveOfType(slot, localRoot, lib, libManager);
}

/**
 * Resolve a Query/parameterized slot's `of` constraint to its base type proto.
 * The parser stores `<of:Point>` under the `_of` child key whose type is the
 * referenced base (e.g. `ph.Point`).  Returns null if there is no `of`.
 */
export function resolveOfType(
  slot: Proto,
  localRoot: Proto | undefined,
  lib: XetoLib | undefined,
  libManager: LibraryManager
): Proto | null {
  const of = slot.children._of;
  if (of == null) return null;
  return resolveTypeProto(of.type, localRoot, lib, libManager);
}

/** Collect all slots of a type, including inherited, deduped by name. */
export function collectSlots(
  typeProto: Proto,
  localRoot: Proto | undefined,
  lib: XetoLib | undefined,
  libManager: LibraryManager
): SlotInfo[] {
  const out: SlotInfo[] = [];
  const seen = new Set<string>();

  for (const { proto, depth } of selfAndSupertypes(
    typeProto,
    localRoot,
    lib,
    libManager
  )) {
    for (const [name, child] of Object.entries(proto.children)) {
      if (!realSlotName(name) || seen.has(name)) continue;
      // skip ontology-wide global slots (e.g. PhEntity's 500+ tag defs)
      if (isGlobalSlot(child)) continue;
      seen.add(name);

      const isMarker = child.type === "sys.Marker";
      const { typeName, optional } = slotTypeName(child);
      // required markers are implied by the spec via inheritance -- only
      // optional markers (`Marker?`) are worth suggesting as additions
      if (isMarker && !optional) continue;

      const resolved = isMarker
        ? null
        : resolveTypeProto(typeName, localRoot, lib, libManager);
      out.push({
        name,
        doc: child.doc,
        typeName,
        optional,
        isMarker,
        hasSlots: resolved != null && slotOpensDict(resolved, localRoot, lib, libManager),
        inherited: depth > 0,
        declaredBy: proto.name,
      });
    }
  }

  return out;
}

/**
 * Should a slot of this type be completed as a brace-opening `{ }` dict?
 * Enum/Choice slots take a scalar/ref value (not a dict).  Query slots hold a
 * dict of named constituents even though Query declares no child slots.
 * Otherwise, any type with real child slots opens a dict.
 */
function slotOpensDict(
  resolved: Proto,
  localRoot: Proto | undefined,
  lib: XetoLib | undefined,
  libManager: LibraryManager
): boolean {
  if (
    isEnumType(resolved, localRoot, lib, libManager) ||
    isChoiceType(resolved, localRoot, lib, libManager)
  ) {
    return false;
  }
  if (isQueryType(resolved, localRoot, lib, libManager)) return true;
  return Object.keys(resolved.children).some(realSlotName);
}

/** Collect an enum's values: its lowercase, non-meta children. */
export function collectEnumValues(typeProto: Proto): SlotInfo[] {
  const out: SlotInfo[] = [];
  for (const [name, child] of Object.entries(typeProto.children)) {
    if (!realSlotName(name) || !/^[a-z]/.test(name)) continue;
    out.push({
      name,
      doc: child.doc,
      typeName: typeProto.name,
      optional: false,
      isMarker: false,
      hasSlots: false,
      inherited: false,
      declaredBy: typeProto.name,
    });
  }
  return out;
}

/**
 * The user-applicable meta tags (e.g. abstract, sealed, doc) are the slots
 * declared on `sys::Spec`.  Internal/reflective slots are marked `sealed`
 * (id, name, qname, base, type, members, ...) -- we filter those out.
 */
export function collectMetaTags(
  localRoot: Proto | undefined,
  lib: XetoLib | undefined,
  libManager: LibraryManager
): SlotInfo[] {
  const spec = resolveTypeProto("Spec", localRoot, lib, libManager);
  if (spec == null) return [];

  const out: SlotInfo[] = [];
  for (const [name, child] of Object.entries(spec.children)) {
    if (!realSlotName(name) || !/^[a-z]/.test(name)) continue;
    // sealed slots on Spec are internal reflective fields, not meta tags
    if (child.children._sealed != null) continue;

    const isMarker =
      child.type === "sys.Marker" ||
      (child.type === "sys.Maybe" &&
        child.children._of?.type === "sys.Marker");

    out.push({
      name,
      doc: child.doc,
      typeName: isMarker ? "Marker" : child.type ?? "",
      optional: true,
      isMarker,
      hasSlots: false,
      inherited: false,
      declaredBy: "Spec",
    });
  }
  return out;
}
