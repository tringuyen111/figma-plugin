/// <reference types="@figma/plugin-typings" />
import { DEFAULT_MAX_EXPORT_BYTES, MAX_BINARY_ARTIFACT_BYTES, ErrorCode, type BridgeError, type ExportFormat } from "../../shared/protocol.js";
import { PluginExecError } from "./execute-js.js";

interface ExportNodeParams {
  nodeId?: unknown;
  format?: unknown;
  constraint?: unknown;
  contentsOnly?: unknown;
  useAbsoluteBounds?: unknown;
  colorProfile?: unknown;
  svgOutlineText?: unknown;
  svgIdAttribute?: unknown;
  svgSimplifyStroke?: unknown;
  fps?: unknown;
  quality?: unknown;
  loopCount?: unknown;
  maxBytes?: unknown;
}

export interface ExportBinaryResult {
  kind: "binary";
  format: ExportFormat;
  bytes: Uint8Array;
  metadata: Record<string, unknown>;
}

type ExportableNode = { exportAsync(settings?: unknown): Promise<unknown> };

export async function exportNode(params: ExportNodeParams): Promise<ExportBinaryResult> {
  const nodeId = requiredNodeId(params.nodeId);
  const format = requiredFormat(params.format);
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || typeof (node as { exportAsync?: unknown }).exportAsync !== "function") {
    throw failure(
      ErrorCode.TARGET_NOT_FOUND,
      `Node "${nodeId}" was not found or does not support exportAsync.`,
      "Refresh the target node id and export a Figma node that supports exportAsync.",
    );
  }

  if (node.type === "PAGE" && "loadAsync" in node && typeof node.loadAsync === "function") {
    await node.loadAsync();
  }

  const settings = buildExportSettings(format, params);
  const maxBytes = normalizeMaxBytes(params.maxBytes);
  let raw: unknown;
  try {
    raw = await (node as unknown as ExportableNode).exportAsync(settings);
  } catch (cause) {
    throw failure(
      ErrorCode.SANDBOX_ERROR,
      cause instanceof Error ? cause.message : String(cause),
      format === "MP4" || format === "GIF" || format === "WEBM"
        ? "Video/GIF/WebM export requires an animated top-level frame. Reduce size/quality or target the timeline-owning top-level frame."
        : "Check node/editor support and the requested export settings, then retry with a smaller or compatible target.",
    );
  }

  const bytes = toBytes(raw, format);
  if (bytes.byteLength > maxBytes) {
    throw failure(
      ErrorCode.OUTPUT_TOO_LARGE,
      `Export is ${bytes.byteLength} bytes; requested local transport limit is ${maxBytes}.`,
      "Reduce scale/dimensions/quality or export a smaller node. ControlMux keeps artifact bytes out of model context but still bounds local transport memory.",
    );
  }

  return {
    kind: "binary",
    format,
    bytes,
    metadata: {
      nodeId,
      nodeName: typeof (node as { name?: unknown }).name === "string" ? (node as { name: string }).name : "",
      nodeType: typeof (node as { type?: unknown }).type === "string" ? (node as { type: string }).type : "",
      editorType: figma.editorType,
      byteLength: bytes.byteLength,
      ...(typeof (node as { width?: unknown }).width === "number" ? { naturalWidth: (node as { width: number }).width } : {}),
      ...(typeof (node as { height?: unknown }).height === "number" ? { naturalHeight: (node as { height: number }).height } : {}),
      ...(params.constraint !== undefined ? { constraint: normalizeConstraint(params.constraint, format) } : {}),
    },
  };
}

function requiredNodeId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || /[\u0000-\u001f]/.test(value)) {
    throw failure(ErrorCode.INVALID_PARAMS, "figma_export requires a non-empty nodeId up to 256 characters.");
  }
  return value;
}

function requiredFormat(value: unknown): ExportFormat {
  const format = typeof value === "string" ? value.toUpperCase() : "";
  if (format === "JPEG") return "JPG";
  if (["PNG", "JPG", "SVG", "PDF", "JSON", "MP4", "GIF", "WEBM"].includes(format)) return format as ExportFormat;
  throw failure(ErrorCode.INVALID_PARAMS, "figma_export format must be PNG, JPG, SVG, PDF, JSON, MP4, GIF, or WEBM.");
}

function buildExportSettings(format: ExportFormat, params: ExportNodeParams): Record<string, unknown> {
  const common: Record<string, unknown> = {};
  if (params.contentsOnly !== undefined) common.contentsOnly = booleanParam(params.contentsOnly, "contentsOnly");
  if (params.useAbsoluteBounds !== undefined) common.useAbsoluteBounds = booleanParam(params.useAbsoluteBounds, "useAbsoluteBounds");
  if (params.colorProfile !== undefined) common.colorProfile = enumParam(params.colorProfile, "colorProfile", ["DOCUMENT", "SRGB", "DISPLAY_P3_V4"]);

  if (format === "PNG" || format === "JPG") {
    return { format, ...common, ...(params.constraint !== undefined ? { constraint: normalizeConstraint(params.constraint, format) } : {}) };
  }
  if (format === "SVG") {
    return {
      format: "SVG",
      ...common,
      ...(params.svgOutlineText !== undefined ? { svgOutlineText: booleanParam(params.svgOutlineText, "svgOutlineText") } : {}),
      ...(params.svgIdAttribute !== undefined ? { svgIdAttribute: booleanParam(params.svgIdAttribute, "svgIdAttribute") } : {}),
      ...(params.svgSimplifyStroke !== undefined ? { svgSimplifyStroke: booleanParam(params.svgSimplifyStroke, "svgSimplifyStroke") } : {}),
    };
  }
  if (format === "PDF") return { format: "PDF", ...common };
  if (format === "JSON") return { format: "JSON_REST_V1" };

  const video: Record<string, unknown> = {
    format,
    ...(params.constraint !== undefined ? { constraint: normalizeConstraint(params.constraint, format) } : {}),
  };
  if (params.fps !== undefined) {
    const fps = integerParam(params.fps, "fps", 1, 60);
    const allowed = format === "GIF" ? [8, 12, 15, 24, 30] : [12, 24, 30, 60];
    if (!allowed.includes(fps)) throw failure(ErrorCode.INVALID_PARAMS, `${format} fps must be one of: ${allowed.join(", ")}.`);
    video.fps = fps;
  }
  if ((format === "MP4" || format === "WEBM") && params.quality !== undefined) {
    video.quality = enumParam(params.quality, "quality", ["LOW", "MEDIUM", "HIGH"]);
  }
  if (format === "GIF" && params.loopCount !== undefined) video.loopCount = integerParam(params.loopCount, "loopCount", 0, 1000);
  return video;
}

function normalizeConstraint(value: unknown, format: ExportFormat): { type: "SCALE" | "WIDTH" | "HEIGHT"; value: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw failure(ErrorCode.INVALID_PARAMS, "constraint must be an object with type and value.");
  const record = value as Record<string, unknown>;
  const type = enumParam(record.type, "constraint.type", ["SCALE", "WIDTH", "HEIGHT"]) as "SCALE" | "WIDTH" | "HEIGHT";
  if (typeof record.value !== "number" || !Number.isFinite(record.value) || record.value <= 0) {
    throw failure(ErrorCode.INVALID_PARAMS, "constraint.value must be a positive finite number.");
  }
  if ((format === "MP4" || format === "GIF" || format === "WEBM") && type === "SCALE" && ![0.5, 0.75, 1, 1.5, 2, 3, 4].includes(record.value)) {
    throw failure(ErrorCode.INVALID_PARAMS, "Video/GIF/WebM SCALE must be one of 0.5, 0.75, 1, 1.5, 2, 3, or 4.");
  }
  return { type, value: record.value };
}

function toBytes(raw: unknown, format: ExportFormat): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  if (format === "JSON" && raw && typeof raw === "object") return utf8Bytes(JSON.stringify(raw));
  if (format === "SVG" && typeof raw === "string") return utf8Bytes(raw);
  throw failure(ErrorCode.INTERNAL, `Figma returned an unexpected ${typeof raw} payload for ${format} export.`);
}

function utf8Bytes(value: string): Uint8Array {
  let byteLength = 0;
  for (let i = 0; i < value.length; i += 1) {
    const first = value.charCodeAt(i);
    if (first < 0x80) byteLength += 1;
    else if (first < 0x800) byteLength += 2;
    else if (first >= 0xd800 && first <= 0xdbff && i + 1 < value.length) {
      const second = value.charCodeAt(i + 1);
      if (second >= 0xdc00 && second <= 0xdfff) {
        byteLength += 4;
        i += 1;
      } else byteLength += 3;
    } else byteLength += 3;
  }

  const out = new Uint8Array(byteLength);
  let offset = 0;
  for (let i = 0; i < value.length; i += 1) {
    let codePoint = value.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < value.length) {
      const second = value.charCodeAt(i + 1);
      if (second >= 0xdc00 && second <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (second - 0xdc00);
        i += 1;
      } else codePoint = 0xfffd;
    } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
      codePoint = 0xfffd;
    }

    if (codePoint < 0x80) {
      out[offset++] = codePoint;
    } else if (codePoint < 0x800) {
      out[offset++] = 0xc0 | (codePoint >> 6);
      out[offset++] = 0x80 | (codePoint & 0x3f);
    } else if (codePoint < 0x10000) {
      out[offset++] = 0xe0 | (codePoint >> 12);
      out[offset++] = 0x80 | ((codePoint >> 6) & 0x3f);
      out[offset++] = 0x80 | (codePoint & 0x3f);
    } else {
      out[offset++] = 0xf0 | (codePoint >> 18);
      out[offset++] = 0x80 | ((codePoint >> 12) & 0x3f);
      out[offset++] = 0x80 | ((codePoint >> 6) & 0x3f);
      out[offset++] = 0x80 | (codePoint & 0x3f);
    }
  }
  return out;
}

function normalizeMaxBytes(value: unknown): number {
  if (value === undefined) return DEFAULT_MAX_EXPORT_BYTES;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > MAX_BINARY_ARTIFACT_BYTES) {
    throw failure(ErrorCode.INVALID_PARAMS, `maxBytes must be an integer from 1 to ${MAX_BINARY_ARTIFACT_BYTES}.`);
  }
  return value;
}

function booleanParam(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw failure(ErrorCode.INVALID_PARAMS, `${label} must be boolean.`);
  return value;
}

function integerParam(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw failure(ErrorCode.INVALID_PARAMS, `${label} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function enumParam<T extends string>(value: unknown, label: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value.toUpperCase() as T)) {
    throw failure(ErrorCode.INVALID_PARAMS, `${label} must be one of: ${allowed.join(", ")}.`);
  }
  return value.toUpperCase() as T;
}

function failure(code: ErrorCode, message: string, hint?: string): PluginExecError {
  const bridgeError: BridgeError = { code, message, ...(hint ? { hint } : {}) };
  return new PluginExecError(bridgeError);
}
