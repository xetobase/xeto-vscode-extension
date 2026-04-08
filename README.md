# XETO Extension for VSCode

[![GitHub CI](https://github.com/xetobase/xeto-vscode-extension/actions/workflows/main.yml/badge.svg)](https://github.com/xetobase/xeto-vscode-extension/actions/workflows/main.yml)
[![License](https://img.shields.io/badge/license-bsd--3--clause-brightgreen)](https://opensource.org/license/bsd-3-clause/)

## Overview

The XETO Extension for VSCode provides language support and code editing features for the XETO language using the Language Server Protocol (LSP).

### Key Features

- **Syntax highlighting** - Rich syntax highlighting for XETO code
- **Code completion** - Intelligent autocomplete suggestions
- **Semantic tokens** - Context-aware syntax coloring
- **Hover information** - Inline documentation on hover
- **Go to definition** - Navigate to symbol definitions
- **Rename symbols** - Rename across entire workspace
- **Formatting** - Automatic code formatting

### Environments

The extension works in both:
- **Desktop environment** - Full-featured VS Code
- **Web environment** - Compatible with [vscode.dev](https://vscode.dev) and [github.dev](https://github.dev)

## Features

- Code editor features:

  - Syntax highlighting: Get syntax highlights for the `XETO` language
  - Folding: fold code around XETO constructs like `{` and `<`
  - Autoclosing: generate closing constructs for `{`, `<` and `'`
  - Sematic tokens support: change colors for tokens based on their semantics

  ![](./docs/images/syntax.gif)

- Diagnostics: Receive real-time errors regarding syntax problems

  ![](./docs/images/diagnostics.gif)

- Code completion proposals: Suggestions regarding properties on existing protos

  ![](./docs/images/completion.gif)

- Hover information: Show available docs for symbols

  ![](./docs/images/hover.gif)

- Show Definition of a Symbol: Peek the definition of a symbol defined either in the current workspace or in an external library

  ![](./docs/images/peek.gif)

- Go to definition of a Symbol: Navigation to symbols, both in the current workspace and in the external libraries

  ![](./docs/images/goto-def.gif)

- Formatting: Automatically format code according to language-specific rules.

  ![](./docs/images/format.gif)

- Rename symbol: Rename a symbol accross the entire workspace

  ![](./docs/images/rename.gif)

- Document symbols: Quickly search for symbols defined in the current file

  ![](./docs/images/doc-symbols.gif)

- Workspace symbols: Quickly search for symbols defined in the current workspace

  ![](./docs/images/workspace-symbols.gif)

- Document outline: Provides a fast way to see all the symbols defined in the current file and provides navigation the their definition

  ![](./docs/images/doc-outline.gif)

- Support for data instances

## Library Support

The extension resolves types from multiple sources. Everything works together automatically — the only setup required depends on your project's needs.

### How It Works

On startup, the extension builds a type index from up to four sources. When the same library exists at multiple levels, the **highest-priority source wins**:

| Priority | Source | Config Required? | What It Reads |
|----------|--------|-----------------|---------------|
| **100** (highest) | Workspace `.xeto` source | None — automatic | Raw `.xeto` files in your open workspace |
| **50** | Workspace `.xetolib` files | None — automatic | Compiled `.xetolib` ZIP files in your workspace |
| **1-N** | External libraries | `settings.json` | Raw `.xeto` source or compiled `.xetolib` files at configured paths |
| **-1** (lowest) | Bundled standard libs | None — built-in | `sys`, `ph`, `ph.equips`, `ph.points`, etc. |

### Zero-Config: What Works Out of the Box

**Just install and open a `.xeto` file.** Without any configuration:

- The **bundled standard libraries** (`sys`, `ph`, `ph.equips`, `ph.points`, `ashrae.g36`, etc.) load instantly on startup. These provide base types like `Dict`, `Str`, `Number`, `Site`, `Equip`, `Point`, and the full Project Haystack ontology.

- **Any `.xeto` files in your workspace** are automatically discovered and parsed. Open your project root in VS Code and all your specs, funcs, and data definitions will have full language support — autocomplete, hover, go-to-definition, diagnostics.

- **Any `.xetolib` files in your workspace** are automatically discovered and loaded. If you have compiled xetolib ZIPs (e.g., from a Haxall build) checked into your project or in a `lib/` directory, those types will be available too.

### External Libraries: When You Need More

When your project references types from libraries that aren't in the standard set and aren't in your workspace, you need to tell the extension where to find them. Common scenarios:

- Your xetolib extends types from **Haxall** (`hx::Ext`, `hx::SysExt`, etc.)
- Your project depends on **another team's xetolib** in a separate repo
- You want to reference types from a **Haxall installation** on your machine

Configure external libraries by creating a `.vscode/settings.json` in your workspace root:

```json
{
  "xeto.libraries.external": [
    "/path/to/other-repo/src/xeto",
    "/path/to/haxall/lib/xeto"
  ]
}
```

Each path should point to a **parent directory** that contains library subdirectories. The extension scans each path for subdirectories containing either:
- A `lib.xeto` file (raw source library)
- A `.xetolib` file (compiled library)

**Example directory structures the extension understands:**

```
# Raw source (e.g., pointing at a repo's src/xeto/)
src/xeto/
  my.analytics/
    lib.xeto        ← discovered as "my.analytics"
    specs.xeto
    funcs.xeto
  my.connectors/
    lib.xeto        ← discovered as "my.connectors"
    specs.xeto

# Compiled xetolibs (e.g., pointing at haxall's lib/xeto/)
lib/xeto/
  hx/
    hx-4.0.5.xetolib     ← discovered as "hx"
  hx.rule/
    hx.rule-4.0.5.xetolib ← discovered as "hx.rule"
  axon/
    axon-4.0.5.xetolib    ← discovered as "axon"
```

### Platform-Specific Examples

**macOS / Linux:**
```json
{
  "xeto.libraries.external": [
    "/Users/username/haxall/lib/xeto",
    "/Users/username/other-project/src/xeto"
  ]
}
```

**Windows:**
```json
{
  "xeto.libraries.external": [
    "C:\\Code\\haxall-4.0.5\\lib\\xeto",
    "C:\\Code\\monoRepos\\analytics\\src\\xeto"
  ]
}
```

### Common Setups

**Standalone xetolib project (depends only on standard types):**
No settings needed. The bundled `sys` and `ph` libraries cover standard types.

**Xetolib project extending Haxall:**
Point at your Haxall installation's compiled libs:
```json
{
  "xeto.libraries.external": [
    "/path/to/haxall/lib/xeto"
  ]
}
```

**Multi-repo development (your lib depends on a sibling repo's libs):**
Point at the sibling repo's source:
```json
{
  "xeto.libraries.external": [
    "/path/to/sibling-repo/src/xeto"
  ]
}
```

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `xeto.libraries.external` | `string[]` | `[]` | Paths to parent directories containing xeto libraries outside your workspace. Each path is scanned for subdirectories with `lib.xeto` (raw source) or `.xetolib` (compiled) files. |

## Usage

1. Open a `xeto` file that has the `.xeto` extension
2. The XETO Extension will automatically activate and provide language features
3. Use the provided Visual Studio Code keyboard actions and/or commands

## Installation

### Extension Marketplace

1. Launch Visual Studio Code
2. Open the `Extensions` tab using <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> or <kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>
3. Search by using `xeto`
4. Install the extension

### GitHub Release

1. Go to the "Releases" [section](https://github.com/xetobase/xeto-vscode-extension/releases)
2. Download the latest release package under `extension.vsix`
3. Launch Visual Studio Code
4. Open the `Extensions` tab using <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> or <kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>
5. Select `Install from VSIX...` from the `Views and More Actions` menu
6. Navigate to the downloaded file and select it

**Note:** For detailed instructions on installing from VSIX, see the [official VS Code documentation](https://code.visualstudio.com/docs/editor/extension-marketplace#_install-from-a-vsix).

## Contributing

We welcome bug reports, feature requests, and feedback! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the BSD-3-Clause License. See the [LICENSE](https://opensource.org/license/bsd-3-clause/) for more info.
