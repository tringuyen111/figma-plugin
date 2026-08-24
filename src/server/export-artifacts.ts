import { chmod, lstat, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import type { ExportFormat } from "../shared/protocol.js";
import { ErrorCode, OpError } from "./errors.js";
import { baseDir } from "./paths.js";

export const DEFAULT_EXPORT_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface ExportArtifactResult {
  artifact: {
    path: string;
    uri: string;
    filename: string;
    format: ExportFormat;
    mimeType: string;
    byteLength: number;
    sha256: string;
    retention: "ephemeral-24h" | "user-managed";
    nodeId?: string;
    nodeName?: string;
    nodeType?: string;
    editorType?: string;
    naturalWidth?: number;
    naturalHeight?: number;
    actualPixelWidth?: number;
    actualPixelHeight?: number;
    requestedConstraint?: unknown;
    snapshotId?: string;
    bundleRevision?: string;
    pageId?: string | null;
    colorProfile?: string;
  };
}

const FORMAT_INFO: Record<ExportFormat, { extension: string; mimeType: string }> = {
  PNG: { extension: ".png", mimeType: "image/png" },
  JPG: { extension: ".jpg", mimeType: "image/jpeg" },
  SVG: { extension: ".svg", mimeType: "image/svg+xml" },
  PDF: { extension: ".pdf", mimeType: "application/pdf" },
  JSON: { extension: ".json", mimeType: "application/json" },
  MP4: { extension: ".mp4", mimeType: "video/mp4" },
  GIF: { extension: ".gif", mimeType: "image/gif" },
  WEBM: { extension: ".webm", mimeType: "video/webm" },
};

export async function persistExportArtifact(
  result: unknown,
  requestedFilename?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ExportArtifactResult> {
  const record = unwrapBinary(result);
  const format = requireFormat(record["format"]);
  const bytes = requireBytes(record["bytes"]);
  const info = FORMAT_INFO[format];
  const actualPixels = format === "PNG" ? validatePngArtifact(bytes, record) : undefined;
  const { dir, ephemeral } = resolveExportLocation(env);
  if (ephemeral) await ensurePrivateDirectory(baseDir(env), true);
  await ensurePrivateDirectory(dir, ephemeral);
  if (ephemeral) await cleanupExpiredExports(dir).catch(() => {});

  const baseFilename = resolveFilename(requestedFilename, record["nodeName"], format, info.extension);
  const { path, filename } = await writeUniqueArtifact(dir, baseFilename, bytes);

  return {
    artifact: {
      path,
      uri: pathToFileURL(path).href,
      filename,
      format,
      mimeType: info.mimeType,
      byteLength: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      retention: ephemeral ? "ephemeral-24h" : "user-managed",
      ...(typeof record["nodeId"] === "string" ? { nodeId: record["nodeId"] as string } : {}),
      ...(typeof record["nodeName"] === "string" ? { nodeName: record["nodeName"] as string } : {}),
      ...(typeof record["nodeType"] === "string" ? { nodeType: record["nodeType"] as string } : {}),
      ...(typeof record["editorType"] === "string" ? { editorType: record["editorType"] as string } : {}),
      ...(finiteNumber(record["naturalWidth"]) ? { naturalWidth: record["naturalWidth"] as number } : {}),
      ...(finiteNumber(record["naturalHeight"]) ? { naturalHeight: record["naturalHeight"] as number } : {}),
      ...(actualPixels ? { actualPixelWidth: actualPixels.width, actualPixelHeight: actualPixels.height } : {}),
      ...(record["constraint"] !== undefined ? { requestedConstraint: record["constraint"] } : {}),
      ...(typeof record["snapshotId"] === "string" ? { snapshotId: record["snapshotId"] } : {}),
      ...(typeof record["bundleRevision"] === "string" ? { bundleRevision: record["bundleRevision"] } : {}),
      ...(typeof record["pageId"] === "string" ? { pageId: record["pageId"] } : record["pageId"] === null ? { pageId: null } : {}),
      ...(typeof record["colorProfile"] === "string" ? { colorProfile: record["colorProfile"] } : {}),
    },
  };
}

export function resolveExportDir(env: NodeJS.ProcessEnv = process.env): string {
  return resolveExportLocation(env).dir;
}

function resolveExportLocation(env: NodeJS.ProcessEnv): { dir: string; ephemeral: boolean } {
  const configured = env["CONTROLMUX_FIGMA_EXPORT_DIR"]?.trim();
  if (!configured) return { dir: join(baseDir(env), "exports"), ephemeral: true };
  if (!isAbsolute(configured)) {
    throw new OpError(
      ErrorCode.INVALID_PARAMS,
      "CONTROLMUX_FIGMA_EXPORT_DIR must be an absolute path.",
      "Use an absolute local directory or unset it to use the private ControlMux runtime directory.",
    );
  }
  return { dir: configured, ephemeral: false };
}

async function ensurePrivateDirectory(dir: string, enforcePrivateMode: boolean): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const stat = await lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new OpError(ErrorCode.UNAUTHORIZED, `Unsafe export directory: ${dir}.`);
  }
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    throw new OpError(ErrorCode.UNAUTHORIZED, `Export directory is not owned by the current user: ${dir}.`);
  }
  if (enforcePrivateMode) await chmod(dir, 0o700).catch(() => {});
}

async function cleanupExpiredExports(dir: string, now = Date.now()): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile()) return;
    const path = join(dir, entry.name);
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) return;
      if (typeof process.getuid === "function" && stat.uid !== process.getuid()) return;
      if (now - stat.mtimeMs > DEFAULT_EXPORT_RETENTION_MS) await rm(path, { force: true });
    } catch {
      // Best-effort cleanup must never make a new export fail.
    }
  }));
}

function unwrapBinary(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new OpError(ErrorCode.INTERNAL, "figma_export returned no artifact payload.");
  const outer = value as Record<string, unknown>;
  const record = outer["result"] && typeof outer["result"] === "object" ? outer["result"] as Record<string, unknown> : outer;
  if (!(record["bytes"] instanceof Uint8Array)) throw new OpError(ErrorCode.INTERNAL, "figma_export returned a non-binary artifact payload.");
  return record;
}

function requireFormat(value: unknown): ExportFormat {
  if (typeof value !== "string" || !(value in FORMAT_INFO)) throw new OpError(ErrorCode.INTERNAL, `Unknown export format "${String(value)}".`);
  return value as ExportFormat;
}

function requireBytes(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new OpError(ErrorCode.INTERNAL, "Export artifact bytes are missing.");
  return value;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validatePngArtifact(
  bytes: Uint8Array,
  record: Record<string, unknown>,
): { width: number; height: number } {
  const dimensions = parsePngIhdrDimensions(bytes);
  const naturalWidth = finiteNumber(record["naturalWidth"]) ? record["naturalWidth"] : undefined;
  const naturalHeight = finiteNumber(record["naturalHeight"]) ? record["naturalHeight"] : undefined;
  const materiallyLargerNode = (naturalWidth !== undefined && naturalWidth > 1)
    || (naturalHeight !== undefined && naturalHeight > 1);

  if (dimensions.width <= 1 && dimensions.height <= 1 && materiallyLargerNode) {
    const nodeLabel = typeof record["nodeName"] === "string" && record["nodeName"].trim()
      ? ` for node "${record["nodeName"]}"`
      : "";
    const reportedSize = `${naturalWidth ?? "unknown"}x${naturalHeight ?? "unknown"}`;
    throw new OpError(
      ErrorCode.INTERNAL,
      `Figma returned a ${dimensions.width}x${dimensions.height} PNG${nodeLabel}, but the node metadata reports ${reportedSize}; the artifact was not persisted.`,
      "Treat this export as failed. Inspect the target node and provider export result before retrying; do not use the reported node dimensions as proof of PNG dimensions.",
    );
  }

  return dimensions;
}

function parsePngIhdrDimensions(bytes: Uint8Array): { width: number; height: number } {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
  const hasSignature = bytes.byteLength >= signature.length
    && signature.every((value, index) => bytes[index] === value);
  if (!hasSignature || bytes.byteLength < 33) {
    throw new OpError(
      ErrorCode.INTERNAL,
      "Figma returned malformed PNG bytes: the PNG signature or complete IHDR chunk is missing; the artifact was not persisted.",
      "Treat this export as failed and inspect the provider response before retrying.",
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ihdrLength = view.getUint32(8, false);
  const isIhdr = bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52;
  if (ihdrLength !== 13 || !isIhdr) {
    throw new OpError(
      ErrorCode.INTERNAL,
      "Figma returned malformed PNG bytes: IHDR is not the first complete PNG chunk; the artifact was not persisted.",
      "Treat this export as failed and inspect the provider response before retrying.",
    );
  }

  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width === 0 || height === 0) {
    throw new OpError(
      ErrorCode.INTERNAL,
      `Figma returned malformed PNG bytes: IHDR declares ${width}x${height} pixels; the artifact was not persisted.`,
      "Treat this export as failed and inspect the provider response before retrying.",
    );
  }
  return { width, height };
}

function resolveFilename(requested: string | undefined, nodeName: unknown, format: ExportFormat, extension: string): string {
  const explicit = requested?.trim();
  if (explicit && (explicit.length > 180 || basename(explicit) !== explicit || /[\/\\\u0000-\u001f]/.test(explicit))) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "filename must be a basename up to 180 characters with no path separators or control characters.");
  }
  const fallback = typeof nodeName === "string" && nodeName.trim() ? nodeName.trim() : `figma-${format.toLowerCase()}-${randomUUID().slice(0, 8)}`;
  const base = explicit || fallback.replace(/[\/\\]/g, " - ");
  const safe = base.replace(/[<>:"|?*]/g, "-").replace(/\s+/g, " ").trim().slice(0, 180);
  if (!safe) throw new OpError(ErrorCode.INVALID_PARAMS, "filename resolves to an empty basename.");
  const currentExt = extname(safe);
  return currentExt ? `${safe.slice(0, -currentExt.length)}${extension}` : `${safe}${extension}`;
}

async function writeUniqueArtifact(dir: string, filename: string, bytes: Uint8Array): Promise<{ path: string; filename: string }> {
  const extension = extname(filename);
  const stem = extension ? filename.slice(0, -extension.length) : filename;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = attempt === 0 ? filename : `${stem}-${attempt + 1}${extension}`;
    const path = join(dir, candidate);
    try {
      await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        await rm(path, { force: true }).catch(() => {});
        throw new OpError(ErrorCode.UNAUTHORIZED, `Unsafe export artifact path: ${path}.`);
      }
      if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
        await rm(path, { force: true }).catch(() => {});
        throw new OpError(ErrorCode.UNAUTHORIZED, `Export artifact is not owned by the current user: ${path}.`);
      }
      await chmod(path, 0o600).catch(() => {});
      return { path, filename: candidate };
    } catch (error) {
      if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "EEXIST") throw error;
    }
  }
  throw new OpError(ErrorCode.INTERNAL, "Could not allocate a unique export artifact filename.");
}
