# XETO Extension for VSCode

[![GitHub CI](https://github.com/xetobase/xeto-vscode-extension/actions/workflows/main.yml/badge.svg)](https://github.com/xetobase/xeto-vscode-extension/actions/workflows/main.yml)
[![License](https://img.shields.io/badge/license-bsd--3--clause-brightgreen)](https://opensource.org/license/bsd-3-clause/)

## Overview

The XETO Extension for VSCode provides language support and code editing features for the XETO language using the Language Server Protocol (LSP).

### Key Features

- **Syntax highlighting** - with semantic token support
- **Code completion** - type-aware suggestions from resolved libraries
- **Go to definition** - across local files and external libraries
- **Hover information** - inline documentation on hover
- **Diagnostics** - syntax errors and unresolved dependency warnings
- **Props-based resolution** - automatic library discovery via `fan.props` / `xeto.props`
- **Context switching** - reloads libraries when switching between repos
- **Rename symbols** - across the entire workspace
- **Formatting** - automatic code formatting

### Environments

The extension works in both:
- **Desktop environment** - Full-featured VS Code
- **Web environment** - Compatible with [vscode.dev](https://vscode.dev) and [github.dev](https://github.dev)

## Library Resolution

The extension discovers Xeto libraries using the same conventions as the Fantom/Xeto CLI tools. For most projects, **no configuration is needed**.

### Props-Based Path Resolution

When you open a `.xeto` file, the extension walks up the directory tree looking for `xeto.props` or `fan.props`. If found, it parses the `path=` line and scans the resolved directories for libraries.

```properties
# fan.props
path=../studio;../haxall;../xeto
```

Paths are semicolon-separated and resolved relative to the props file directory. Each resolved directory is scanned for `src/xeto/` (raw source) and `lib/xeto/` (compiled xetolibs).

This is the same resolution mechanism used by `xetoc` and the Haxall runtime.

### What Works Out of the Box

**Just install and open a `.xeto` file.** The bundled standard libraries (`sys`, `ph`, `ph.equips`, `ph.points`, `ashrae.g36`, etc.) are always available. If your project has a `fan.props` with a `path=` line, all referenced repos are resolved automatically.

### Priority

When the same library exists at multiple levels, the highest-priority source wins:

| Priority | Source | Description |
|----------|--------|-------------|
| **1000+** | Source `.xeto` files | Raw source in `src/xeto/` directories |
| **10+** | Compiled `.xetolib` files | Compiled libraries in `lib/xeto/` directories |
| **1-N** | External libraries | Configured via `xeto.libraries.external` setting |
| **-1** | Bundled standard libs | `sys`, `ph`, `ph.equips`, etc. |

### Status Bar

The status bar shows the current resolution state:
- `Xeto: fan.props (5 paths)` - resolved via fan.props
- `Xeto: xeto.props (3 paths)` - resolved via xeto.props
- `Xeto: bundled only` - no props file found

Click it to see the full resolved path in the Output channel.

### Dependency Diagnostics

In `lib.xeto` files, each entry in the `depends` block is checked against the resolved path. If a referenced library isn't found, a warning appears on the lib name.

### Live Props Watching

When you edit a `fan.props` or `xeto.props` file, the extension automatically invalidates its cache and re-resolves. No VS Code reload needed.

### External Libraries (Fallback)

For projects without a props file, you can configure library paths manually in `.vscode/settings.json`:

**macOS / Linux:**
```json
{
  "xeto.libraries.external": [
    "/path/to/haxall/lib/xeto",
    "/path/to/other-repo/src/xeto"
  ]
}
```

**Windows:**
```json
{
  "xeto.libraries.external": [
    "C:\\Code\\haxall\\lib\\xeto",
    "C:\\Code\\other-repo\\src\\xeto"
  ]
}
```

Each path is scanned for subdirectories containing a `lib.xeto` file (raw source) or a `.xetolib` file (compiled library).

## Features

**Syntax highlighting** with semantic token support:

![](./docs/images/syntax.gif)

**Go to definition** across local files and external libraries:

![](./docs/images/goto-def.gif)

**Code completion** with type-aware suggestions:

![](./docs/images/completion.gif)

See the full feature gallery with demos in [FEATURES.md](FEATURES.md).

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
