import {
  type Connection,
  DidChangeConfigurationNotification,
  DidChangeWatchedFilesNotification,
  type InitializeParams,
  type InitializeResult,
  TextDocumentSyncKind,
} from "vscode-languageserver";
import {
  type ExtLibDef,
  type LibraryManager,
  loadExtLibs,
} from "./libraries";
import { type ProtoCompiler } from "./compiler/Compiler";

let hasWorkspaceFolderCapability = false;
let hasConfigurationCapability = false;

export const generateInitResults = (
  params: InitializeParams
): InitializeResult<unknown> => {
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace != null && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace != null && !!capabilities.workspace.workspaceFolders
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      definitionProvider: true,
      documentFormattingProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      renameProvider: true,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: [".", ":", "@"],
      },
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }
  return result;
};

export const onInitialized = async (
  connection: Connection,
  libManager: LibraryManager,
  compiledDocs: Record<string, ProtoCompiler>
): Promise<void> => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    void connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
    // Watch for props file changes (fan.props, xeto.props)
    void connection.client.register(
      DidChangeWatchedFilesNotification.type,
      {
        watchers: [
          { globPattern: "**/fan.props" },
          { globPattern: "**/xeto.props" },
        ],
      }
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log("Workspace folder change event received.");
    });
  }

  //  keep the document ref, but delete all the keys
  Object.keys(compiledDocs).forEach((key) => {
    //  eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete compiledDocs[key];
  });

  const settings = await connection.workspace.getConfiguration("xeto");

  const externalLibs = settings?.libraries?.external ?? [];

  loadExtLibs(
    externalLibs as Array<string | ExtLibDef>,
    libManager
  );
};
