import {
  type CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  type CompletionParams,
  type Connection,
  type TextDocuments,
} from "vscode-languageserver";

import {
  collectVisibleTypes,
  collectSubtypes,
  collectSlots,
  collectEnumValues,
  collectMetaTags,
  isEnumType,
  isChoiceType,
  isQueryType,
  resolveSlotType,
  resolveSlotOf,
  resolveOfType,
  type SlotInfo,
  type TypeInfo,
} from "./spec-utils";

import {
  getEnclosingDict,
  getTypePositionPartial,
  getValuePositionSlot,
  getMetaBlockPartial,
  getInsertContext,
  formatInsert,
  type InsertContext,
} from "./cursor-utils";

import { getIdentifierForPosition } from "./identifier-utils";
import { findChildrenOf, findDataInstances } from "../FindProto";
import { type XetoLib, type LibraryManager } from "../libraries";
import { type ProtoCompiler } from "../compiler/Compiler";
import { type TextDocument } from "vscode-languageserver-textdocument";
import { Token } from "../compiler/Token";

//  `labelDetails` (LSP 3.17) renders always-visible inline text next to the
//  label.  The installed vscode-languageserver typings predate it, so extend
//  the type locally -- VSCode renders it fine at runtime.
type CompletionItemEx = CompletionItem & {
  labelDetails?: { detail?: string; description?: string };
};


/**
 * Build a completion item for a type name.  When the cursor is inside a tight
 * `{ }` (e.g. a Query dict), `ctx` expands the insert onto its own indented
 * line; otherwise it inserts the bare name in place.
 */
const typeToCompletion = (
  t: TypeInfo,
  ctx: InsertContext
): CompletionItem => ({
  label: t.name,
  kind: CompletionItemKind.Class,
  detail: t.lib,
  documentation: t.doc,
  insertText: formatInsert(t.name, ctx),
  insertTextFormat: InsertTextFormat.Snippet,
});



/** Convert meta tags (Spec slots) into completion items for `< >` blocks. */
const metaTagsToCompletions = (tags: SlotInfo[]): CompletionItem[] =>
  tags.map((t): CompletionItemEx => {
    const item: CompletionItemEx = {
      label: t.name,
      kind: t.isMarker
        ? CompletionItemKind.Constant
        : CompletionItemKind.Field,
      labelDetails: { description: t.isMarker ? "marker" : t.typeName },
      detail: t.isMarker ? "marker" : t.typeName,
      documentation: t.doc,
    };
    // value metas insert `name:`; markers insert the bare name
    if (!t.isMarker) {
      item.insertText = `${t.name}: `;
    }
    return item;
  });

/** Convert an enum's values into quoted-string completion items. */

const enumValuesToCompletions = (values: SlotInfo[]): CompletionItem[] =>
  values.map(
    (v, i): CompletionItemEx => ({
      label: v.name,
      kind: CompletionItemKind.EnumMember,
      // labelDetails.description is always shown (right-aligned), unlike detail
      labelDetails: { description: v.typeName },
      detail: v.typeName,
      documentation: v.doc,
      insertText: `"${v.name}"`,
      sortText: `${i}`.padStart(4, "0"),
    })
  );

/** Convert a type's slots into completion items (used inside a typed dict). */
const slotsToCompletions = (
  slots: SlotInfo[],
  ctx: InsertContext
): CompletionItem[] =>
  slots.map((s) => {
    const typePart = s.isMarker
      ? "marker"
      : `${s.typeName}${s.optional ? " (optional)" : ""}`;
    // show where inherited slots come from
    const detail = s.inherited ? `${typePart} — ${s.declaredBy}` : typePart;

    const item: CompletionItemEx = {
      label: s.name,
      kind: s.isMarker
        ? CompletionItemKind.Constant
        : CompletionItemKind.Field,
      // labelDetails is always shown inline (not just on the selected row)
      labelDetails: { description: detail },
      detail,
      documentation: s.doc,
      // direct slots sort above inherited; required above optional within each
      sortText: `${s.inherited ? "1" : "0"}_${s.optional ? "1" : "0"}_${s.name}`,
    };


    // named slots insert `name: `; nested-dict slots open a brace.  Both go
    // through formatInsert so they land on their own indented line when the
    // cursor is inside a tight `{ }`.
    if (!s.isMarker) {
      const body = s.hasSlots ? `${s.name}: {\n  $0\n}` : `${s.name}: $0`;
      item.insertText = formatInsert(body, ctx);
      item.insertTextFormat = InsertTextFormat.Snippet;
    }

    return item;
  });

export const addAutoCompletion = (
  connection: Connection,
  libManager: LibraryManager,
  compiledDocs: Record<string, ProtoCompiler>,
  docs: TextDocuments<TextDocument>,
  uriToLib: Map<string, XetoLib>
): void => {
  function handleAutoCompletion(params: CompletionParams): CompletionItem[] {
    // let try to find the identifier for this position
    const compiledDocument = compiledDocs[params.textDocument.uri];
    const doc = docs.get(params.textDocument.uri);

    if (!compiledDocument || doc == null) {
      return [];
    }

    //  shared insertion context: drives indentation/brace expansion for every
    //  completion item produced below (single choke point for formatting)
    const ctx = getInsertContext(doc, params.position);

    //  maybe is trigger by @ - data instance
    if (params.context?.triggerCharacter === "@") {
      const dataInstaces =
        compiledDocument.root && findDataInstances(compiledDocument.root);

      const suggestions: CompletionItem[] = [];

      // it may also want to refer to a lib
      const lib = uriToLib.get(params.textDocument.uri);

      if (lib) {
        suggestions.push(
          ...lib.deps.map((dep) => ({
            label: dep,
            kind: CompletionItemKind.Folder,
            detail: "",
            documentation: "",
          }))
        );
      }

      if (dataInstaces) {
        suggestions.push(
          ...dataInstaces.map((op) => ({
            label: op.label.substring(1),
            kind: CompletionItemKind.Field,
            detail: op.parent,
            documentation: op.doc,
          }))
        );
      }

      if (suggestions.length) {
        return suggestions;
      }
    }

    const lib = uriToLib.get(compiledDocument.sourceUri);

    //  meta completion: cursor inside a `< >` meta block -- suggest the
    //  user-applicable meta tags (slots declared on sys::Spec).
    const metaPartial = getMetaBlockPartial(doc, params.position);
    if (metaPartial != null) {
      const tags = collectMetaTags(compiledDocument.root, lib, libManager).filter(
        (t) => t.name.toLowerCase().startsWith(metaPartial.toLowerCase())
      );
      if (tags.length > 0) {
        return metaTagsToCompletions(tags);
      }
    }

    //  type-context completion: if the cursor is inside a typed `{ }` dict,
    //  surface that type's slots (including inherited).  This is pure spec
    //  walking and works against any lib in the env.  One pass yields both
    //  the enclosing slot and its resolved type.
    const enclosing = getEnclosingDict(
      doc,
      params.position,
      compiledDocument.root,
      lib,
      libManager
    );
    const enclosingType = enclosing.type;

    if (enclosingType != null) {
      //  value-position: cursor is after `slotName: ` -- if the slot's type
      //  is an Enum, suggest its values; otherwise suggest fitting types.
      const valueSlot = getValuePositionSlot(doc, params.position);
      if (valueSlot != null) {
        const slotType = resolveSlotType(
          enclosingType,
          valueSlot.slot,
          compiledDocument.root,
          lib,
          libManager
        );
        if (slotType != null) {
          //  Query slot (e.g. `points: Point`): suggest only the `of`
          //  constraint's subtypes, not every type in the env.
          if (isQueryType(slotType, compiledDocument.root, lib, libManager)) {
            const ofType = resolveSlotOf(
              enclosingType,
              valueSlot.slot,
              compiledDocument.root,
              lib,
              libManager
            );
            if (ofType != null) {
              const subtypes = collectSubtypes(
                ofType,
                compiledDocument.root,
                lib,
                libManager
              ).filter((t) =>
                t.name.toLowerCase().startsWith(valueSlot.partial.toLowerCase())
              );
              if (subtypes.length > 0) {
                return subtypes.map((t) => typeToCompletion(t, ctx));
              }
            }
          }
          //  Enum slot: suggest the enum's quoted-string values
          if (isEnumType(slotType, compiledDocument.root, lib, libManager)) {
            return enumValuesToCompletions(collectEnumValues(slotType));
          }

          //  Choice slot: suggest the choice's concrete subtypes only
          if (isChoiceType(slotType, compiledDocument.root, lib, libManager)) {
            const subtypes = collectSubtypes(
              slotType,
              compiledDocument.root,
              lib,
              libManager
            ).filter((t) =>
              t.name.toLowerCase().startsWith(valueSlot.partial.toLowerCase())
            );
            return subtypes.map((t) => typeToCompletion(t, ctx));
          }
          //  otherwise: suggest types assignable to the slot type
          const types = collectVisibleTypes(lib, libManager).filter((t) =>
            t.name.toLowerCase().startsWith(valueSlot.partial.toLowerCase())
          );
          if (types.length > 0) {
            return types.map((t) => typeToCompletion(t, ctx));
          }
        }
      }

      //  Query slot (e.g. `points: Query<of:Point>`): each entry inside the
      //  `{ }` is a type name -- suggest the `of` constraint's subtypes.
      if (isQueryType(enclosingType, compiledDocument.root, lib, libManager)) {
        const slot = enclosing.slot;
        const ofType =
          slot != null
            ? resolveOfType(slot, compiledDocument.root, lib, libManager)
            : null;
        if (ofType != null) {
          const typePartial = getTypePositionPartial(doc, params.position) ?? "";
          const subtypes = collectSubtypes(
            ofType,
            compiledDocument.root,
            lib,
            libManager
          ).filter((t) =>
            t.name.toLowerCase().startsWith(typePartial.toLowerCase())
          );
          if (subtypes.length > 0) {
            return subtypes.map((t) => typeToCompletion(t, ctx));
          }
        }
      }

      const slots = collectSlots(
        enclosingType,
        compiledDocument.root,
        lib,
        libManager
      );
      if (slots.length > 0) {
        return slotsToCompletions(slots, ctx);
      }
    }


    //  type-position completion: cursor is after `slotName:` on a spec
    //  declaration -- suggest all visible types (own lib + deps + sys).
    const typePartial = getTypePositionPartial(doc, params.position);
    if (typePartial != null) {
      const types = collectVisibleTypes(lib, libManager).filter((t) =>
        t.name.toLowerCase().startsWith(typePartial.toLowerCase())
      );
      if (types.length > 0) {
        return types.map((t) => typeToCompletion(t, ctx));
      }
    }

    const partialIdentifier = getIdentifierForPosition(doc, params.position);

    if (!partialIdentifier) {
      return [];
    }

    let options =
      (compiledDocument.root != null &&
        findChildrenOf(partialIdentifier, compiledDocument.root)) ||
      [];

    //	maybe the identifier is from a lib
    if (
      options.length === 0 &&
      partialIdentifier.includes(Token.DOUBLE_COLON.toString())
    ) {
      const parts = partialIdentifier.split(Token.DOUBLE_COLON.toString());
      const isDataInstance = parts[0].startsWith("@");
      const libName = isDataInstance ? parts[0].slice(1) : parts[0];
      const lib = libManager.getLib(libName);

      if (lib) {
        const identifierWithoutLib = isDataInstance ? "@" + parts[1] : parts[1];

        //  we don't allow drill down after the lib type
        if (identifierWithoutLib === "") {
          options = findChildrenOf(identifierWithoutLib, lib.rootProto);
        }

        if (identifierWithoutLib === "@") {
          options = findDataInstances(lib.rootProto).map((o) => ({
            ...o,
            label: o.label.slice(1),
          }));
        }
      }
    }

    return options.map((op) => ({
      label: op.label,
      kind: CompletionItemKind.Field,
      detail: op.parent,
      documentation: op.doc,
    }));
  }

  connection.onCompletion(handleAutoCompletion);

  // This handler resolves additional information for the item selected in
  // the completion list.
  connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    return item;
  });
};
