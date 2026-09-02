import * as path from "node:path";
import { defineConfig } from "vitest/config";

// The server's runtime deps live in server/node_modules (npm workspaces are
// not used here), so point vite's resolver there for LSP packages.
const serverDep = (name: string): string =>
  path.resolve(__dirname, "server/node_modules", name);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^vscode-languageserver\/node$/,
        replacement: serverDep("vscode-languageserver/node.js"),
      },
      {
        find: /^vscode-languageserver-protocol\/node$/,
        replacement: serverDep("vscode-languageserver-protocol/node.js"),
      },
      {
        find: /^vscode-languageserver$/,
        replacement: serverDep("vscode-languageserver"),
      },
      {
        find: /^vscode-languageserver-textdocument$/,
        replacement: serverDep("vscode-languageserver-textdocument"),
      },
    ],
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // LSP harness boots once per file; corpus sweep parses many files
    testTimeout: 20000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      include: ["server/src/**/*.ts"],
      reporter: ["text", "html"],
    },
  },
});
