import * as fs from "node:fs";
import * as zlib from "node:zlib";

/**
 * Metadata parsed from meta.props inside a .xetolib ZIP.
 * BuildVar is already resolved in meta.props, so we get clean
 * name/version/depends/doc without needing to parse lib.xeto.
 */
export interface XetolibMeta {
  name: string;
  version: string;
  depends: string[];
  doc: string;
}

/**
 * Full content extracted from a .xetolib ZIP file.
 */
export interface XetolibContent {
  meta: XetolibMeta;
  /** Map of filename -> file content for all .xeto files (excluding lib.xeto) */
  xetoFiles: Map<string, string>;
}

/**
 * Parse meta.props content (simple key=value lines).
 *
 * Example:
 *   name=hx
 *   version=4.0.5
 *   depends=sys 5.0.0;axon 4.0.5
 *   doc=Haxall framework
 */
const parseMetaProps = (content: string): XetolibMeta => {
  const props: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;

    const key = trimmed.substring(0, eqIdx);
    const val = trimmed.substring(eqIdx + 1);
    props[key] = val;
  }

  const dependsStr = props["depends"] ?? "";
  const depends =
    dependsStr.length === 0
      ? []
      : dependsStr.split(";").map((entry) => entry.trim().split(" ")[0]);

  return {
    name: props["name"] ?? "",
    version: props["version"] ?? "",
    depends,
    doc: props["doc"] ?? "",
  };
};

// ---------------------------------------------------------------------------
// Minimal ZIP reader using Node built-in zlib
//
// ZIP format (simplified):
//   [local file header + compressed data] ...
//   [central directory entries] ...
//   [end of central directory record]
//
// We read the end-of-central-directory record to find the central directory,
// then iterate each central directory entry to get file offsets, then read
// each local file header to extract and decompress the file data.
// ---------------------------------------------------------------------------

const ZIP_EOCD_SIG = 0x06054b50;
const ZIP_CD_SIG = 0x02014b50;
const ZIP_LOCAL_SIG = 0x04034b50;

interface ZipEntry {
  fileName: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  localHeaderOffset: number;
}

/**
 * Find the End of Central Directory record.
 * It's at the end of the file, with a minimum size of 22 bytes.
 * We scan backwards to find the signature.
 */
const findEocd = (buf: Buffer): number => {
  // EOCD is at least 22 bytes. The comment field can make it larger.
  // Scan backwards from end, up to 65KB (max comment size).
  const minPos = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === ZIP_EOCD_SIG) {
      return i;
    }
  }
  return -1;
};

/**
 * Read all central directory entries from a ZIP buffer.
 */
const readCentralDirectory = (buf: Buffer): ZipEntry[] => {
  const eocdPos = findEocd(buf);
  if (eocdPos < 0) return [];

  const cdOffset = buf.readUInt32LE(eocdPos + 16);
  const cdEntries = buf.readUInt16LE(eocdPos + 10);

  const entries: ZipEntry[] = [];
  let pos = cdOffset;

  for (let i = 0; i < cdEntries; i++) {
    if (buf.readUInt32LE(pos) !== ZIP_CD_SIG) break;

    const compressionMethod = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);

    const fileName = buf.toString("utf-8", pos + 46, pos + 46 + nameLen);

    entries.push({
      fileName,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      localHeaderOffset,
    });

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
};

/**
 * Extract a single file's content from the ZIP buffer using its local header offset.
 */
const extractEntry = (buf: Buffer, entry: ZipEntry): Buffer | null => {
  const pos = entry.localHeaderOffset;
  if (buf.readUInt32LE(pos) !== ZIP_LOCAL_SIG) return null;

  const nameLen = buf.readUInt16LE(pos + 26);
  const extraLen = buf.readUInt16LE(pos + 28);
  const dataStart = pos + 30 + nameLen + extraLen;
  const compressedData = buf.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    // Stored (no compression)
    return compressedData as Buffer;
  } else if (entry.compressionMethod === 8) {
    // Deflated
    return zlib.inflateRawSync(new Uint8Array(compressedData));
  }

  return null;
};

/**
 * Read a .xetolib ZIP file and extract its contents.
 *
 * Returns the parsed metadata from meta.props and all .xeto source files
 * (excluding lib.xeto which still contains unresolved BuildVar macros).
 */
export const readXetolib = (filePath: string): XetolibContent | null => {
  try {
    const buf = fs.readFileSync(filePath);
    const entries = readCentralDirectory(buf);

    if (entries.length === 0) return null;

    let meta: XetolibMeta | null = null;
    const xetoFiles = new Map<string, string>();

    for (const entry of entries) {
      if (entry.fileName === "meta.props") {
        const data = extractEntry(buf, entry);
        if (data != null) {
          meta = parseMetaProps(data.toString("utf-8"));
        }
      } else if (
        entry.fileName.endsWith(".xeto") &&
        entry.fileName !== "lib.xeto"
      ) {
        const data = extractEntry(buf, entry);
        if (data != null) {
          xetoFiles.set(entry.fileName, data.toString("utf-8"));
        }
      }
    }

    if (meta == null || meta.name.length === 0) return null;

    return { meta, xetoFiles };
  } catch {
    return null;
  }
};
