# Features

## Code Editor

- Syntax highlighting: Get syntax highlights for the `XETO` language
- Folding: fold code around XETO constructs like `{` and `<`
- Autoclosing: generate closing constructs for `{`, `<` and `'`
- Semantic tokens support: change colors for tokens based on their semantics

  ![](./docs/images/syntax.gif)

## Diagnostics

Receive real-time errors regarding syntax problems

  ![](./docs/images/diagnostics.gif)

## Code Completion

Context-aware completions driven by the Xeto type system:

- **Slot completion** — inside a typed `{ }` dict, suggests the type's slots (including inherited), with nested dict expansion
- **Enum values** — for enum-typed slots, suggests the valid quoted-string values
- **Choice subtypes** — for choice-typed slots, suggests concrete subtypes
- **Query constraints** — inside a Query dict (e.g. `points`), suggests subtypes of the `of` constraint
- **Type completion** — after `slotName:` in a spec declaration, suggests all visible types
- **Meta tags** — inside `< >` meta blocks, suggests applicable meta tags from `sys::Spec`
- **Smart formatting** — completions expand with proper 2-space indentation inside tight `{ }` blocks

  ![](./docs/images/completion.gif)


## Hover Information

Show available docs for symbols

  ![](./docs/images/hover.gif)

## Peek Definition

Peek the definition of a symbol defined either in the current workspace or in an external library

  ![](./docs/images/peek.gif)

## Go to Definition

Navigation to symbols, both in the current workspace and in the external libraries

  ![](./docs/images/goto-def.gif)

## Formatting

Automatically format code according to language-specific rules

  ![](./docs/images/format.gif)

## Rename Symbol

Rename a symbol across the entire workspace

  ![](./docs/images/rename.gif)

## Document Symbols

Quickly search for symbols defined in the current file

  ![](./docs/images/doc-symbols.gif)

## Workspace Symbols

Quickly search for symbols defined in the current workspace

  ![](./docs/images/workspace-symbols.gif)

## Document Outline

Provides a fast way to see all the symbols defined in the current file and provides navigation to their definition

  ![](./docs/images/doc-outline.gif)

## Data Instances

Support for data instances
