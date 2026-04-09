/* --------------------------------------------------------------------------------------------
 * Copyright (c) Xetobase
 * ------------------------------------------------------------------------------------------ */

import * as path from "path";
import {
  commands,
  languages,
  workspace,
  window,
  type ExtensionContext,
  StatusBarAlignment,
  SemanticTokensLegend,
} from "vscode";

import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

import XetoProvider from "./xeto-contentprovider";
import XetoSemanticTokenProvider from "./xeto-semanticprovider";

let client: LanguageClient;

export function activate(context: ExtensionContext): void {
  // The server is implemented in node
  const serverModule = context.asAbsolutePath(
    path.join("server", "out", "server.js")
  );
  // The debug options for the server
  // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
  const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for plain text documents
    documentSelector: [{ scheme: "file", language: "xeto" }],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
    },
    initializationOptions: {
      extensionPath: context.extensionPath,
    },
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    "xetoServer",
    "Xeto Server",
    serverOptions,
    clientOptions
  );

  // Start the client. This will also launch the server
  client.start();

  workspace.registerTextDocumentContentProvider("xeto", new XetoProvider(client));

  const legend = (function () {
    const tokenTypesLegend = ["label", "namespace", "docLink", "dataInstance", "globalTag"];

    const tokenModifiersLegend = ["defaultLibrary"];

    return new SemanticTokensLegend(tokenTypesLegend, tokenModifiersLegend);
  })();

  const selector = { language: "xeto", scheme: "file" };
  context.subscriptions.push(
    languages.registerDocumentSemanticTokensProvider(
      selector,
      new XetoSemanticTokenProvider(client),
      legend
    )
  );

  // --- Status bar: xeto env path indicator (isolated, pull-based) ---
  const statusBar = window.createStatusBarItem(StatusBarAlignment.Right, 50);
  statusBar.text = "$(file-code) Xeto";
  statusBar.tooltip = "Xeto environment — loading...";
  statusBar.command = "xeto.showResolvedPath";
  statusBar.show();
  context.subscriptions.push(statusBar);

  let pathInfo: { mode: string; workDir: string; pathCount: number; dirs: string[] } | null = null;
  const pathChannel = window.createOutputChannel("Xeto Env Path");
  context.subscriptions.push(pathChannel);

  // Update the output channel with current path info
  const updateOutputChannel = (): void => {
    pathChannel.clear();
    if (pathInfo == null) {
      pathChannel.appendLine("No xeto environment path resolved yet.");
      pathChannel.appendLine("Using bundled standard libs only.");
      pathChannel.appendLine("");
      pathChannel.appendLine("To enable path resolution, create a fan.props or xeto.props");
      pathChannel.appendLine("file in your project root with a path= line.");
    } else {
      pathChannel.appendLine(`mode:    ${pathInfo.mode}`);
      pathChannel.appendLine(`workDir: ${pathInfo.workDir}`);
      pathChannel.appendLine(`path:`);
      pathInfo.dirs.forEach((dir) => pathChannel.appendLine(`  ${dir}`));
    }
  };

  // Poll the server for path info
  const pollPathInfo = (): void => {
    const activeUri = window.activeTextEditor?.document.uri.toString();
    client.sendRequest("xeto/getPathInfo", { uri: activeUri }).then(
      (result: unknown) => {
        const info = result as typeof pathInfo;
        if (info != null) {
          pathInfo = info;
          statusBar.text = `$(file-code) Xeto: ${info.mode} (${info.pathCount} paths)`;
          statusBar.tooltip = `Xeto env: ${info.mode}\nworkDir: ${info.workDir}\n${info.pathCount} path dirs`;
        } else {
          pathInfo = null;
          statusBar.text = "$(file-code) Xeto: bundled only";
          statusBar.tooltip = "No fan.props or xeto.props found — using bundled libs";
        }
        updateOutputChannel();
      },
      () => {
        // Request failed (server not ready), try again later
        setTimeout(pollPathInfo, 5000);
      }
    );
  };

  // Start polling after 3 seconds (give server time to boot + scan)
  setTimeout(pollPathInfo, 3000);

  // Re-poll when switching to a different .xeto file (different repo = different path)
  // Also notify the server so it can re-evaluate context for already-open files
  context.subscriptions.push(
    window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.languageId === "xeto") {
        client.sendNotification("xeto/activeFileChanged", {
          uri: editor.document.uri.toString(),
        });
        setTimeout(pollPathInfo, 500);
      }
    })
  );

  // Command: show the output channel
  context.subscriptions.push(
    commands.registerCommand("xeto.showResolvedPath", () => {
      updateOutputChannel();
      pathChannel.show();
    })
  );
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
