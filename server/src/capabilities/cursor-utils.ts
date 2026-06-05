import {
  type TextDocument,
  type Position,
} from "vscode-languageserver-textdocument";
import { type Proto } from "../compiler/Proto";
import { type LibraryManager, type XetoLib } from "../libraries";
import { findSlotOnType, resolveTypeProto } from "./spec-utils";

/// ///////////////////////////////////////////////////////////////////////
// Cursor context analysis
//
// Given a cursor position, work out the situation the user is editing in:
// which `{ }` dict (and slot) encloses them, whether they are in a
// type/value/meta position, and how a completion should be indented when it
// is inserted.  Autocompletion-specific.
/// ///////////////////////////////////////////////////////////////////////

/** The current line's text from its start up to the cursor offset. */
function lineUpToCursor(text: string, offset: number): string {
  let start = offset;
  while (start > 0 && text[start - 1] !== "\n") start--;
  return text.slice(start, offset);
}

/// ///////////////////////////////////////////////////////////////////////
// Insertion formatting -- the single choke point for indentation
/// ///////////////////////////////////////////////////////////////////////

/**
 * The cursor situation needed to format an insertion: the enclosing line's
 * indent, and whether the cursor sits in a "tight" empty dict (`{|}`) that
 * must be expanded onto its own indented lines.
 */
export interface InsertContext {
  baseIndent: string;
  expandBraces: boolean;
}

export function getInsertContext(
  doc: TextDocument,
  pos: Position
): InsertContext {
  const text = doc.getText();
  const offset = doc.offsetAt(pos);

  // nearest non-space char before / after the cursor (stay on inline ws only)
  let b = offset - 1;
  while (b >= 0 && (text[b] === " " || text[b] === "\t")) b--;
  let a = offset;
  while (a < text.length && (text[a] === " " || text[a] === "\t")) a++;

  return {
    baseIndent: /^(\s*)/.exec(lineUpToCursor(text, offset))?.[1] ?? "",
    expandBraces: text[b] === "{" && text[a] === "}",
  };
}

/**
 * Single choke point for formatting a completion's insert text.  `body` is a
 * template using `\n` for line breaks and `$0`/`$1` snippet tabstops, written
 * at zero indentation.  This indents it to fit the cursor context:
 *  - inside a tight `{ }`: open the braces onto their own lines, one level in
 *  - already on a fresh line: keep the first line at the cursor, indent the
 *    continuation lines to the enclosing indent
 */
export function formatInsert(body: string, ctx: InsertContext): string {
  const lines = body.split("\n");
  if (ctx.expandBraces) {
    const inner = ctx.baseIndent + "  ";
    return `\n${lines.map((l) => inner + l).join("\n")}\n${ctx.baseIndent}`;
  }
  return lines.map((l, i) => (i === 0 ? l : ctx.baseIndent + l)).join("\n");
}

/// ///////////////////////////////////////////////////////////////////////
// Cursor position classification
/// ///////////////////////////////////////////////////////////////////////

/**
 * Determine if the cursor is in a "type position" (after `slotName:` on a
 * spec declaration line) where a type name should be suggested.  Returns the
 * partial type text typed so far, or null if not in a type position.
 */
export function getTypePositionPartial(
  doc: TextDocument,
  pos: Position
): string | null {
  const line = lineUpToCursor(doc.getText(), doc.offsetAt(pos));
  // `name :` or `name:` followed by an optional partial type identifier.
  const m = line.match(/(?:^|[{,])\s*[A-Za-z_]\w*\s*:\s*([A-Za-z_][\w.]*)?$/);
  return m == null ? null : m[1] ?? "";
}

/**
 * If the cursor is in a value position inside a dict (`slotName: <partial>`),
 * return the slot name and partial value text.  Returns null otherwise.
 */
export function getValuePositionSlot(
  doc: TextDocument,
  pos: Position
): { slot: string; partial: string } | null {
  const line = lineUpToCursor(doc.getText(), doc.offsetAt(pos));
  const m = line.match(/(?:^|[{,])\s*([a-z]\w*)\s*:\s*([A-Za-z_][\w.]*)?$/);
  return m == null ? null : { slot: m[1], partial: m[2] ?? "" };
}

/**
 * Returns the partial text typed so far if the cursor is inside a meta `< >`
 * block (and not nested in a `{ }` dict within it), else null.
 */
export function getMetaBlockPartial(
  doc: TextDocument,
  pos: Position
): string | null {
  const text = doc.getText();
  const offset = doc.offsetAt(pos);

  let depthBrace = 0;
  let i = offset - 1;
  while (i >= 0) {
    const c = text[i];
    if (c === "\n") return null; // meta blocks are single-line in practice
    if (c === "}") depthBrace++;
    else if (c === "{") {
      if (depthBrace > 0) depthBrace--;
      else return null; // inside a dict, not meta
    } else if (c === ">") {
      return null; // a closed meta block precedes us
    } else if (c === "<" && depthBrace === 0) {
      // found the opening of our meta block -- collect partial token
      return text.slice(i + 1, offset).match(/([A-Za-z_]\w*)?$/)?.[1] ?? "";
    }
    i--;
  }
  return null;
}

/// ///////////////////////////////////////////////////////////////////////
// Enclosing dict resolution
/// ///////////////////////////////////////////////////////////////////////

interface DictHeader {
  slot?: string;
  type?: string;
}

function parseHeaderString(s: string): DictHeader {
  s = s.trim();
  if (s.length === 0) return {};

  // strip a trailing Maybe marker on a type ref
  const cleanType = (t: string): string => t.replace(/\?$/, "").trim();

  const colonIdx = s.indexOf(":");
  if (colonIdx >= 0) {
    const slot = s.slice(0, colonIdx).trim();
    const type = cleanType(s.slice(colonIdx + 1).trim());
    return { slot: slot || undefined, type: type || undefined };
  }

  // No colon: capitalized is a type ref, lowercase is a marker/slot name
  if (/^[A-Z]/.test(s)) return { type: cleanType(s) };
  return { slot: s };
}

/** Read the header (`slotName: Type` / `Type` / `slotName:`) before a `{`. */
function readHeaderBefore(
  text: string,
  bracePos: number
): { header: DictHeader; nextIndex: number } {
  let j = bracePos - 1;

  // skip whitespace/newlines
  while (j >= 0 && /\s/.test(text[j])) j--;

  // skip a trailing meta block `<...>`
  if (j >= 0 && text[j] === ">") {
    let depth = 1;
    j--;
    while (j >= 0 && depth > 0) {
      if (text[j] === ">") depth++;
      else if (text[j] === "<") depth--;
      j--;
    }
    while (j >= 0 && /\s/.test(text[j])) j--;
  }

  // collect header chars on this statement
  let s = "";
  while (j >= 0) {
    const c = text[j];
    if (c === "\n" || c === "{" || c === "}" || c === ">" || c === "<" || c === ",")
      break;
    s = c + s;
    j--;
  }

  return { header: parseHeaderString(s), nextIndex: j };
}

/** Walk backwards from the cursor, collecting enclosing dict headers. */
function parseEnclosingHeaders(text: string, offset: number): DictHeader[] {
  const headers: DictHeader[] = [];
  let depth = 0;
  let i = offset - 1;

  while (i >= 0) {
    const c = text[i];
    if (c === "}") {
      depth++;
      i--;
    } else if (c === "{") {
      if (depth > 0) {
        depth--;
        i--;
      } else {
        const { header, nextIndex } = readHeaderBefore(text, i);
        headers.unshift(header);
        i = nextIndex;
      }
    } else if (c === ">") {
      // skip meta block when scanning
      let md = 1;
      i--;
      while (i >= 0 && md > 0) {
        if (text[i] === ">") md++;
        else if (text[i] === "<") md--;
        i--;
      }
    } else {
      i--;
    }
  }

  return headers;
}

/**
 * Resolve the cursor's enclosing `{ }` dict to both the slot whose value dict
 * it is inside and that slot's resolved type.  Either may be null.  Walking
 * the header chain once yields both, so callers pick the field they need.
 */
export function getEnclosingDict(
  doc: TextDocument,
  pos: Position,
  localRoot: Proto | undefined,
  lib: XetoLib | undefined,
  libManager: LibraryManager
): { type: Proto | null; slot: Proto | null } {
  const headers = parseEnclosingHeaders(doc.getText(), doc.offsetAt(pos));
  if (headers.length === 0) return { type: null, slot: null };

  let curType: Proto | null = null;
  let curSlot: Proto | null = null;
  for (const h of headers) {
    if (h.type != null) {
      curType = resolveTypeProto(h.type, localRoot, lib, libManager);
      curSlot = null;
    } else if (h.slot != null && curType != null) {
      const slot = findSlotOnType(curType, h.slot, localRoot, lib, libManager);
      curSlot = slot;
      curType =
        slot == null
          ? null
          : resolveSlotValueType(slot, localRoot, lib, libManager);
    } else {
      curType = null;
      curSlot = null;
    }
  }

  return { type: curType, slot: curSlot };
}

/** Resolve a slot proto's value type, unwrapping a Maybe wrapper. */
function resolveSlotValueType(
  slot: Proto,
  localRoot: Proto | undefined,
  lib: XetoLib | undefined,
  libManager: LibraryManager
): Proto | null {
  const typeName =
    slot.type === "sys.Maybe" ? slot.children._of?.type ?? "" : slot.type ?? "";
  return resolveTypeProto(typeName, localRoot, lib, libManager);
}
