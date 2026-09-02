# Test Suite

Vitest suite covering the language server. Fast, deterministic, and
network-free: the real server is booted in-memory, so the full run takes
about a second.

## Running

```bash
npm test              # unit + types + lsp + manifest (~1s)
npm run test:watch    # watch mode
npm run test:corpus   # parse sweep + format idempotency over bundled libs
npm run test:all      # everything (what CI runs)
npm run test:coverage # v8 coverage over server/src (text + html reports)
```

## CI

`.github/workflows/main.yml` runs `npm ci && npm run compile && npm run
test:all` on every push to main (ubuntu + windows matrix). Any test failure
fails the build. Run `npm run test:all` locally before committing.

## Layout

| Directory | Layer | Needs |
|-----------|-------|-------|
| `unit/` | Tokenizer, Parser, string utils, FileLoc | nothing |
| `types/` | spec-utils, LibManager, path resolver, xetolib reader | `bundled-libs/` |
| `lsp/` | all LSP capabilities + custom requests via in-memory server | in-memory streams |
| `corpus/` | parse sweep + format idempotency over real libs | `bundled-libs/` |
| `manifest/` | package.json ↔ source contract checks | compiled output for entry-point check |
| `helpers/` | `fixtures.ts` (libs, compile), `lsp-harness.ts` (server boot) | — |

Tests live under `test/` — outside `server/src` and `client/src` — so they
are never compiled into the shipped extension, and `.vscodeignore` excludes
them from the `.vsix`.

## The LSP harness

`helpers/lsp-harness.ts` boots the real server (`server/src/createServer.ts`)
over `PassThrough` stream pairs and speaks actual LSP: initialize → didOpen →
completion/hover/definition/format/symbols/rename/diagnostics, plus the
custom `xeto/*` and `xetolib/*` requests. Bundled libs are loaded for real
via `initializationOptions.extensionPath`.

Use `withCursor("Foo: D|ict")` to place a cursor with a `|` marker.

Note: the LSP packages live in `server/node_modules`, so `vitest.config.ts`
carries resolve aliases for them. If deps are ever hoisted to the root,
delete the aliases.

## Corpus parameterization

The sweep defaults to every `.xeto` source inside every bundled `.xetolib`.
Point it at more code with:

```bash
XETO_CORPUS="../xeto/src/xeto;../haxall" npm run test:corpus
```

Dirs are `;`/`,`-separated, swept recursively for `.xeto`/`.xetod`,
missing dirs skipped with a warning.

## Adding tests

- Pure compiler behavior → `unit/`
- Type resolution / lib loading → `types/` (use `bundledManager()`)
- Anything a user sees in the editor → `lsp/` (use the harness)
- New grammar corner cases → add to `unit/tokenizer|parser` AND consider a
  corpus addition
- A test that cannot fail is not a test. No graceful bail-outs, no magic
  thresholds — assert the actual expected value.

## Coverage baseline

Recorded 2026-09-02 (`npm run test:coverage`, server/src):
statements 65.13% · branches 76.28% · functions 80.86%
Don't let it drop.
