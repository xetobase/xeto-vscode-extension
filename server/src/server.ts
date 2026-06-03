/* --------------------------------------------------------------------------------------------
 * Copyright (c) Xetobase
 * ------------------------------------------------------------------------------------------ */
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  type InitializeParams,
  type InitializeResult,
} from "vscode-languageserver/node";

import { VARS } from "./utils";

import { TextDocument } from "vscode-languageserver-textdocument";

import { type ProtoCompiler } from "./compiler/Compiler";
import { LibraryManager, loadBundledLibs, xetolibContentCache } from "./libraries/";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { generateInitResults, onInitialized } from "./init";

import { compilersToLibs, parseDocument, uriToLibs } from "./parseDocument";
import { resolveXetoPath, clearCache } from "./libraries/XetoPathResolver";
import { scanPathForLibs, clearScannedDirs } from "./libraries/PathScanner";
import * as fs from "node:fs";

import {
  addAutoCompletion,
  addRenameSymbol,
  addFormatting,
  addSymbols,
  addSemanticTokens,
  addDefinition,
  addHover,
} from "./capabilities";
VARS.env = "NODE";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments<TextDocument>(TextDocument);

// Ref resolution is now handled on-demand per file open.
// The props-based path scanner loads all lib metadata into LibManager,
// and individual files are parsed when opened via onDidChangeContent.

let rootFolders: string[] = [];

const docsToCompilerResults: Record<string, ProtoCompiler> = {};
const uriToTextDocuments = new Map<string, TextDocument>();

const libManager: LibraryManager = new LibraryManager();

// Captured path resolution info for status bar (set in onDidChangeContent, read via request)
let lastPathInfo: { mode: string; workDir: string; pathCount: number; dirs: string[] } | null = null;

// Track the current path context to detect when we switch repos
let currentWorkDir: string | null = null;

const uriToPath = (uri: string): string => {
  try { return fileURLToPath(uri); } catch { return uri; }
};

const getRootFolderFromParams = (params: InitializeParams): string[] => {
  if (params.workspaceFolders != null) {
    return params.workspaceFolders.map((folder) => uriToPath(folder.uri));
  }

  const rootUri = params.rootUri ?? "";
  return rootUri.length > 0 ? [uriToPath(rootUri)] : [""];
};


connection.onInitialize((params: InitializeParams) => {
  rootFolders = getRootFolderFromParams(params);

  // Load bundled standard libs from the extension install directory
  const extensionPath = params.initializationOptions?.extensionPath;
  if (extensionPath != null) {
    const bundledLibsPath = path.join(extensionPath, "bundled-libs");
    loadBundledLibs(bundledLibsPath, libManager);
  }

  // Scan workspace root folders as a baseline (covers no-props fallback case)
  // This scans {root}/src/xeto/ and {root}/lib/xeto/ at low priority
  const workspaceDirs = rootFolders.filter((f) => Boolean(f));
  if (workspaceDirs.length > 0) {
    const loaded = scanPathForLibs(workspaceDirs, libManager);
    if (loaded > 0) {
      connection.console.log(
        `[xeto] workspace: loaded ${loaded} libs from ${workspaceDirs.length} workspace root(s)`
      );
    }
  }

  return generateInitResults(params);
});

connection.onInitialized((): InitializeResult => {
  void onInitialized(connection, libManager, docsToCompilerResults);

  return {
    capabilities: {},
  };
});

connection.onDidChangeConfiguration((change) => {
  // Revalidate all open text documents
  documents.all().forEach((doc) => {
    void parseDocument(doc, connection, libManager, docsToCompilerResults);
  });
});

// Evaluate the xeto path context for a given file URI.
// Handles context switching (clear + reload) when the workDir changes.
const evaluateContext = (docUri: string): void => {
  let filePath: string | null = null;
  try { filePath = fileURLToPath(docUri); } catch { /* non-file URI */ }

  if (filePath == null) return;

  const fileDir = path.dirname(filePath);
  const resolved = resolveXetoPath(fileDir);
  const newWorkDir = resolved?.workDir ?? null;

  if (newWorkDir !== currentWorkDir) {
    // Context changed — reload LibManager with correct libs for this file
    libManager.clearAbovePriority(0); // keeps bundled (priority -1)
    clearScannedDirs();
    currentWorkDir = newWorkDir;

    if (resolved != null) {
      const loaded = scanPathForLibs(resolved.dirs, libManager);
      connection.console.log(
        `[xeto] context switch → ${resolved.mode}: loaded ${loaded} libs from ${resolved.dirs.length} path dirs (via ${resolved.workDir})`
      );
    } else {
      const workspaceDirs = rootFolders.filter((f) => Boolean(f));
      if (workspaceDirs.length > 0) {
        scanPathForLibs(workspaceDirs, libManager);
      }
      connection.console.log("[xeto] context switch → bundled only");
    }
  }

  if (resolved != null) {
    lastPathInfo = {
      mode: resolved.mode,
      workDir: resolved.workDir,
      pathCount: resolved.dirs.length,
      dirs: resolved.dirs,
    };
  } else {
    lastPathInfo = null;
  }
};

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
  uriToTextDocuments.set(change.document.uri, change.document);

  evaluateContext(change.document.uri);

  void parseDocument(
    change.document,
    connection,
    libManager,
    docsToCompilerResults
  );
});

// Client notifies when active editor changes (tab switch to already-open file)
connection.onNotification("xeto/activeFileChanged", (params: { uri: string }) => {
  evaluateContext(params.uri);
});

connection.onDidChangeWatchedFiles((change) => {
  // Props file changed — invalidate resolver cache and force re-scan on next file open
  const propsChanged = change.changes.some((c) => {
    const uri = c.uri;
    return uri.endsWith("/fan.props") || uri.endsWith("/xeto.props");
  });

  if (propsChanged) {
    clearCache();
    currentWorkDir = null; // force context re-evaluation on next file open
    connection.console.log("[xeto] props file changed — cache invalidated, will re-resolve on next file open");

    // Re-parse all open documents to pick up new lib context
    documents.all().forEach((doc) => {
      void parseDocument(doc, connection, libManager, docsToCompilerResults);
    });
  }
});

// Custom request: serve extracted xetolib content for cmd+click navigation
connection.onRequest("xetolib/content", (params: { uri: string }) => {
  return xetolibContentCache.get(params.uri) ?? null;
});

// Custom request: return path resolution info for a specific file (pull-based)
connection.onRequest("xeto/getPathInfo", (params: { uri?: string }) => {
  // If a URI is provided, resolve for that file specifically
  if (params?.uri != null) {
    let filePath: string | null = null;
    try { filePath = fileURLToPath(params.uri); } catch { /* non-file URI */ }

    if (filePath != null) {
      const resolved = resolveXetoPath(path.dirname(filePath));
      if (resolved != null) {
        return {
          mode: resolved.mode,
          workDir: resolved.workDir,
          pathCount: resolved.dirs.length,
          dirs: resolved.dirs,
        };
      }
    }

    // URI was provided but no path resolved — return null (don't use stale fallback)
    return null;
  }

  // No URI provided — fallback to last captured info
  return lastPathInfo;
});

// Custom request: return build info { libName, workDirs } for a given file.
// libName is the name of the lib dir (the dir containing the file's sibling lib.xeto).
// workDirs lists every props workDir (dir with fan.props/xeto.props) that can build this
// lib — i.e. whose resolved path dirs contain src/xeto/<libName>. A lib may be buildable
// from multiple contexts (its own repo, or another repo whose path= includes it). The
// client picks one (and may remember a default per lib).
connection.onRequest("xeto/getBuildInfo", (params: { uri?: string }) => {
  if (params?.uri == null) return null;

  let filePath: string | null = null;
  try { filePath = fileURLToPath(params.uri); } catch { return null; }
  if (filePath == null) return null;

  const libDir = findLibDir(path.dirname(filePath));
  if (libDir == null) return null;
  const libName = path.basename(libDir);

  const workDirs = findBuildWorkDirs(libName);
  if (workDirs.length === 0) return null;

  return { libName, workDirs };
});

// Walk up from startDir looking for the nearest directory that contains a lib.xeto.
const findLibDir = (startDir: string): string | null => {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (true) {
    if (fs.existsSync(path.join(dir, "lib.xeto"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir || dir === root) return null;
    dir = parent;
  }
};

// Find every props workDir that can build the given lib. A props workDir can build the lib
// if any of its resolved path dirs contains src/xeto/<libName>. Candidates are the props
// files found in the workspace roots and their immediate children (repos are siblings).
const findBuildWorkDirs = (
  libName: string
): Array<{ workDir: string; mode: string }> => {
  const results: Array<{ workDir: string; mode: string }> = [];
  const seen = new Set<string>();

  for (const root of rootFolders.filter((f) => Boolean(f))) {
    for (const candidate of scanForPropsDirs(root)) {
      if (seen.has(candidate.workDir)) continue;
      const resolved = resolveXetoPath(candidate.workDir);
      if (resolved == null) continue;
      const buildable = resolved.dirs.some((dir) =>
        fs.existsSync(path.join(dir, "src", "xeto", libName))
      );
      if (!buildable) continue;
      seen.add(candidate.workDir);
      results.push(candidate);
    }
  }

  return results;
};

// Find directories containing a fan.props or xeto.props in the given root and its
// immediate subdirectories.
const scanForPropsDirs = (root: string): Array<{ workDir: string; mode: string }> => {
  const found: Array<{ workDir: string; mode: string }> = [];

  const check = (dir: string): void => {
    if (fs.existsSync(path.join(dir, "xeto.props"))) {
      found.push({ workDir: dir, mode: "xeto.props" });
    } else if (fs.existsSync(path.join(dir, "fan.props"))) {
      found.push({ workDir: dir, mode: "fan.props" });
    }
  };

  check(root);
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) check(path.join(root, entry.name));
    }
  } catch {
    // root unreadable
  }

  return found;
};

addAutoCompletion(
  connection,
  libManager,
  docsToCompilerResults,
  documents,
  uriToLibs
);

addHover(connection, docsToCompilerResults, documents, uriToLibs, libManager);

addDefinition(
  connection,
  docsToCompilerResults,
  documents,
  uriToLibs,
  libManager
);

addSemanticTokens(connection, libManager, docsToCompilerResults);

addSymbols(connection, docsToCompilerResults);

addFormatting(connection, documents, docsToCompilerResults);

addRenameSymbol(
  connection,
  docsToCompilerResults,
  uriToTextDocuments,
  compilersToLibs
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
