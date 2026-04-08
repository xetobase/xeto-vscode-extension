import * as vscode from "vscode";
import * as https from "node:https";
import { type LanguageClient } from "vscode-languageclient/node";

const readUrl = async (url: string): Promise<string> => {
  const pr = new Promise<string>((resolve, _reject) => {
    https.get(url, (resp) => {
      let data = "";

      resp.on("data", (chunk: string) => {
        data += chunk;
      });

      resp.on("end", () => {
        resolve(data);
      });
    });
  });

  return await pr;
};

export default class XetoProvider
  implements vscode.TextDocumentContentProvider
{
  private readonly _documents = new Map<string, string>();
  private readonly _client: LanguageClient | null;

  constructor(client: LanguageClient | null = null) {
    this._client = client;
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    // Check cache first
    if (this._documents.get(uri.toString())) {
      return this._documents.get(uri.toString()) ?? "";
    }

    // xetolib content: request from the language server
    if (uri.authority === "xetolib" && this._client != null) {
      const content: string | null = await this._client.sendRequest(
        "xetolib/content",
        { uri: uri.toString() }
      );

      if (content != null) {
        this._documents.set(uri.toString(), content);
        return content;
      }

      return `// Content not available for ${uri.toString()}`;
    }

    // Legacy: fetch from HTTPS (for old xeto:// → https:// URLs)
    const finalUri = vscode.Uri.from({
      ...uri,
      scheme: "https",
    });

    return await readUrl(finalUri.toString()).then((content) => {
      this._documents.set(uri.toString(), content);
      return content;
    });
  }
}
