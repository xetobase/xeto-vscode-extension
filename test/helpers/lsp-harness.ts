import { PassThrough } from "node:stream";
import {
  createConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-languageserver/node";
import {
  createProtocolConnection,
  type ProtocolConnection,
  InitializeRequest,
  InitializedNotification,
  DidOpenTextDocumentNotification,
  PublishDiagnosticsNotification,
  CompletionRequest,
  HoverRequest,
  DefinitionRequest,
  DocumentFormattingRequest,
  DocumentSymbolRequest,
  RenameRequest,
  type Diagnostic,
  type CompletionItem,
  type CompletionList,
  type Hover,
  type Location,
  type LocationLink,
  type TextEdit,
  type DocumentSymbol,
  type SymbolInformation,
  type WorkspaceEdit,
  type Position,
} from "vscode-languageserver-protocol/node";
import { createServer } from "../../server/src/createServer";
import { VARS } from "../../server/src/utils";
import { repoRoot } from "./fixtures";

VARS.env = "NODE";

/**
 * In-memory LSP test harness. Boots the real server (createServer) over
 * PassThrough stream pairs and exposes typed request helpers.
 */
export class LspHarness {
  private client!: ProtocolConnection;
  private diagnosticsByUri = new Map<string, Diagnostic[]>();
  private diagnosticWaiters = new Map<string, (d: Diagnostic[]) => void>();
  private docCounter = 0;

  async start(): Promise<void> {
    const clientToServer = new PassThrough();
    const serverToClient = new PassThrough();

    const serverConnection = createConnection(
      new StreamMessageReader(clientToServer),
      new StreamMessageWriter(serverToClient)
    );
    createServer(serverConnection);

    this.client = createProtocolConnection(
      new StreamMessageReader(serverToClient),
      new StreamMessageWriter(clientToServer)
    );
    this.client.onNotification(
      PublishDiagnosticsNotification.type,
      (params) => {
        this.diagnosticsByUri.set(params.uri, params.diagnostics);
        const waiter = this.diagnosticWaiters.get(params.uri);
        if (waiter != null) {
          this.diagnosticWaiters.delete(params.uri);
          waiter(params.diagnostics);
        }
      }
    );
    // server sends workspace/configuration etc.; answer benignly
    this.client.onRequest("workspace/configuration", () => [{}]);
    this.client.onUnhandledNotification(() => {});
    this.client.listen();

    await this.client.sendRequest(InitializeRequest.type, {
      processId: null,
      rootUri: null,
      workspaceFolders: null,
      capabilities: {},
      initializationOptions: { extensionPath: repoRoot },
    });
    await this.client.sendNotification(InitializedNotification.type, {});
  }

  /** Open a virtual xeto document; returns its URI. */
  async openDocument(text: string, name?: string): Promise<string> {
    const uri = `file:///virtual/${name ?? `doc${this.docCounter++}`}.xeto`;
    const wait = this.waitForDiagnostics(uri);
    await this.client.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri, languageId: "xeto", version: 1, text },
    });
    await wait;
    return uri;
  }

  waitForDiagnostics(uri: string, timeoutMs = 5000): Promise<Diagnostic[]> {
    const existing = this.diagnosticsByUri.get(uri);
    if (existing != null) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`no diagnostics for ${uri} in ${timeoutMs}ms`)),
        timeoutMs
      );
      this.diagnosticWaiters.set(uri, (d) => {
        clearTimeout(timer);
        resolve(d);
      });
    });
  }

  diagnostics(uri: string): Diagnostic[] {
    return this.diagnosticsByUri.get(uri) ?? [];
  }

  async completion(
    uri: string,
    position: Position
  ): Promise<CompletionItem[] | CompletionList | null> {
    return await this.client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position,
    });
  }

  async hover(uri: string, position: Position): Promise<Hover | null> {
    return await this.client.sendRequest(HoverRequest.type, {
      textDocument: { uri },
      position,
    });
  }

  async definition(
    uri: string,
    position: Position
  ): Promise<Location | Location[] | LocationLink[] | null> {
    return await this.client.sendRequest(DefinitionRequest.type, {
      textDocument: { uri },
      position,
    });
  }

  async format(uri: string): Promise<TextEdit[] | null> {
    return await this.client.sendRequest(DocumentFormattingRequest.type, {
      textDocument: { uri },
      options: { tabSize: 2, insertSpaces: true },
    });
  }

  async documentSymbols(
    uri: string
  ): Promise<DocumentSymbol[] | SymbolInformation[] | null> {
    return await this.client.sendRequest(DocumentSymbolRequest.type, {
      textDocument: { uri },
    });
  }

  async rename(
    uri: string,
    position: Position,
    newName: string
  ): Promise<WorkspaceEdit | null> {
    return await this.client.sendRequest(RenameRequest.type, {
      textDocument: { uri },
      position,
      newName,
    });
  }

  /** Send an arbitrary (custom) request to the server. */
  async request<T = unknown>(method: string, params: unknown): Promise<T> {
    return (await this.client.sendRequest(method, params)) as T;
  }

  dispose(): void {
    this.client.dispose();
  }
}

/** Boot a harness once (callers share it across a test file). */
export const startHarness = async (): Promise<LspHarness> => {
  const h = new LspHarness();
  await h.start();
  return h;
};

/**
 * Parse a source with a `|` cursor marker: returns text without the marker
 * and the cursor position.
 */
export const withCursor = (
  src: string
): { text: string; position: Position } => {
  const idx = src.indexOf("|");
  if (idx < 0) throw new Error("no | cursor marker in source");
  const before = src.slice(0, idx);
  const lines = before.split("\n");
  return {
    text: src.slice(0, idx) + src.slice(idx + 1),
    position: {
      line: lines.length - 1,
      character: lines[lines.length - 1].length,
    },
  };
};
