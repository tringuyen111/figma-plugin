/// <reference types="@figma/plugin-typings" />
/**
 * Native JavaScript execution inside the Figma plugin main thread.
 *
 * Keep this boundary intentionally small: validate code, execute against the
 * real `figma` Plugin API, normalize JSON-safe evidence, and return root
 * raster exports as raw bytes so the UI iframe can move them over WebSocket
 * without base64 work on the Figma main thread.
 */
import { ErrorCode, type BridgeError } from "../../shared/protocol.js";
import {
  FIGMA_RUNTIME_SDK_EXPRESSIONS,
  FIGMA_RUNTIME_SDK_VERSIONS,
  isFigmaRuntimeSdkVersion,
} from "../runtime-sdk.js";

const DEFAULT_MAX_OUTPUT_CHARS = 12_000;
const HARD_MAX_OUTPUT_CHARS = 100_000;
const MAX_CODE_CHARS = 50_000;
const MAX_DEPTH = 10;
const MAX_ARRAY_ITEMS = 1_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

interface ExecParams {
  code?: unknown;
  maxOutputChars?: unknown;
  runtimeSdk?: unknown;
}

export interface BinaryExecResult {
  kind: "binary";
  format: "PNG" | "JPG";
  bytes: Uint8Array;
  metadata: Record<string, unknown>;
}

export class PluginExecError extends Error {
  constructor(public readonly bridgeError: BridgeError) {
    super(bridgeError.message);
    this.name = "PluginExecError";
  }
}

/** Execute plain JavaScript against the native Figma `figma` global. */
export async function executeJs(params: ExecParams): Promise<unknown | BinaryExecResult> {
  const { code, maxOutputChars, runtimeSdk } = params;
  if (typeof code !== "string" || code.trim().length === 0) {
    throw failure(
      ErrorCode.INVALID_PARAMS,
      "figma_exec requires non-empty JavaScript `code`.",
      "Write plain JavaScript against the native Figma Plugin API and use `return` for compact evidence.",
    );
  }
  if (code.length > MAX_CODE_CHARS) {
    throw failure(
      ErrorCode.INVALID_PARAMS,
      `figma_exec code is ${code.length} characters; limit is ${MAX_CODE_CHARS}.`,
      "Move repetitive work into loops/functions or split genuinely independent work across calls.",
    );
  }
  if (runtimeSdk !== undefined && !isFigmaRuntimeSdkVersion(runtimeSdk)) {
    throw failure(
      ErrorCode.INVALID_PARAMS,
      `runtimeSdk must be one of: ${FIGMA_RUNTIME_SDK_VERSIONS.join(", ")}.`,
      "Omit runtimeSdk for plain native execution or select the documented helper version.",
    );
  }

  const budget = normalizeBudget(maxOutputChars);
  const wrapped = isFigmaRuntimeSdkVersion(runtimeSdk)
    ? `(async function (figmaPlugin) {\n\"use strict\";\n${code}\n}).call(undefined, ${FIGMA_RUNTIME_SDK_EXPRESSIONS[runtimeSdk]})`
    : `(async function () {\n\"use strict\";\n${code}\n}).call(undefined)`;

  let raw: unknown;
  try {
    // Indirect eval intentionally executes in Figma's plugin-global realm so
    // agent code sees the native `figma` object instead of handler locals.
    const evaluateInPluginGlobal = eval;
    raw = await (evaluateInPluginGlobal(wrapped) as Promise<unknown>);
  } catch (cause) {
    throw failure(
      ErrorCode.SANDBOX_ERROR,
      cause instanceof Error ? cause.message : String(cause),
      "Check the exact Figma API/editor support, async page requirements, fonts, and node types before retrying.",
    );
  }

  if (isRasterBinaryReturn(raw)) {
    if (raw.bytes.byteLength > MAX_IMAGE_BYTES) {
      throw failure(
        ErrorCode.OUTPUT_TOO_LARGE,
        `figma_exec image is ${raw.bytes.byteLength} bytes; binary limit is ${MAX_IMAGE_BYTES}.`,
        "Export a smaller region/scale or a more compact raster format before returning it.",
      );
    }

    const metadata: Record<string, unknown> = {};
    for (const key of Object.keys(raw)) {
      if (key === "bytes" || key === "format") continue;
      metadata[key] = normalize((raw as Record<string, unknown>)[key], 0, new WeakSet<object>());
    }
    enforceJsonBudget(metadata, budget, "figma_exec image metadata");

    return {
      kind: "binary",
      format: raw.format.toUpperCase() === "JPEG" ? "JPG" : raw.format.toUpperCase() as BinaryExecResult["format"],
      bytes: raw.bytes,
      metadata,
    };
  }

  const result = serializeExecValue(raw);
  enforceJsonBudget(result, budget, "figma_exec result");
  return result;
}

/** Normalize native return values without serializing Figma node graphs. */
export function serializeExecValue(value: unknown): unknown {
  return normalize(value, 0, new WeakSet<object>());
}

function normalize(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return String(value);
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (depth >= MAX_DEPTH) return "[MaxDepth]";

  // Never base64 arbitrary binary inside the Figma main thread. Raster exports
  // have the dedicated root binary path; nested bytes are represented by size.
  if (value instanceof Uint8Array) {
    return { type: "bytes", byteLength: value.byteLength };
  }
  if (value instanceof ArrayBuffer) {
    return { type: "bytes", byteLength: value.byteLength };
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return { type: value.constructor?.name ?? "TypedArray", byteLength: view.byteLength };
  }

  if (Array.isArray(value)) {
    const limited = value.slice(0, MAX_ARRAY_ITEMS);
    const out = limited.map((item) => normalize(item, depth + 1, seen));
    if (value.length > limited.length) out.push({ truncated: true, returned: limited.length, total: value.length });
    return out;
  }

  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (seen.has(object)) return "[Circular]";
    seen.add(object);

    if (isNativeFigmaNode(object)) {
      const summary: Record<string, unknown> = { id: object.id, type: object.type, name: object.name };
      if (typeof object.visible === "boolean") summary.visible = object.visible;
      if (typeof object.locked === "boolean") summary.locked = object.locked;
      if (typeof object.x === "number") summary.x = object.x;
      if (typeof object.y === "number") summary.y = object.y;
      if (typeof object.width === "number") summary.width = object.width;
      if (typeof object.height === "number") summary.height = object.height;
      return summary;
    }

    const output: Record<string, unknown> = {};
    for (const key of Object.keys(object)) {
      try {
        output[key] = normalize(object[key], depth + 1, seen);
      } catch {
        output[key] = "[Unserializable]";
      }
    }
    return output;
  }

  return String(value);
}

function isRasterBinaryReturn(value: unknown): value is Record<string, unknown> & { format: string; bytes: Uint8Array } {
  if (!value || typeof value !== "object") return false;
  const object = value as Record<string, unknown>;
  const format = typeof object.format === "string" ? object.format.toUpperCase() : "";
  return (format === "PNG" || format === "JPG" || format === "JPEG") && object.bytes instanceof Uint8Array;
}

function isNativeFigmaNode(value: Record<string, unknown>): value is Record<string, unknown> & { id: string; type: string; name: string } {
  return (
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    typeof value.name === "string" &&
    typeof value.remove === "function" &&
    typeof value.setPluginData === "function"
  );
}

function normalizeBudget(raw: unknown): number {
  if (raw === undefined) return DEFAULT_MAX_OUTPUT_CHARS;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    throw failure(
      ErrorCode.INVALID_PARAMS,
      "maxOutputChars must be a positive finite number.",
      `Omit it for the ${DEFAULT_MAX_OUTPUT_CHARS}-character default budget.`,
    );
  }
  return Math.min(Math.floor(raw), HARD_MAX_OUTPUT_CHARS);
}

function enforceJsonBudget(value: unknown, budget: number, label: string): void {
  const json = JSON.stringify(value);
  const size = json === undefined ? 4 : json.length;
  if (size <= budget) return;
  throw failure(
    ErrorCode.OUTPUT_TOO_LARGE,
    `${label} is ${size} JSON characters; response budget is ${budget}.`,
    "Filter, aggregate, slice, or map inside Figma and return only the fields needed for the next decision.",
  );
}

function failure(code: ErrorCode, message: string, hint?: string): PluginExecError {
  return new PluginExecError({ code, message, ...(hint ? { hint } : {}) });
}
