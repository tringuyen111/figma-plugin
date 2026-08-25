import type { IncomingMessage } from "node:http";
import type { RawData } from "ws";
import {
  PROTOCOL_VERSION,
  EXPORT_FORMATS,
  MAX_BINARY_ARTIFACT_BYTES,
  MAX_BINARY_FRAME_BYTES,
  MAX_BINARY_HEADER_BYTES,
  type BinaryResponseHeader,
  type BridgeResponse,
  type FeatureCapabilitiesWire,
  type PluginHello,
  type SyncStateWire,
  type WireMessage,
} from "../shared/protocol.js";
import { ErrorCode } from "./errors.js";

export const MAX_WS_PAYLOAD_BYTES = MAX_BINARY_FRAME_BYTES;

export interface PluginInfo {
  version: string;
  bundleRevision: string;
  protocolVersion: number;
  instanceId: string;
  clientId: string;
  fileKey: string | null;
  fileName: string;
  pageId: string;
  pageName: string;
  pages: Array<{ id: string; name: string }>;
  editorType: string;
  runtimeSdks: string[];
  features?: FeatureCapabilitiesWire;
  sync?: SyncStateWire;
  connectedAt: number;
}

export function helloToInfo(hello: PluginHello, connectedAt = Date.now()): PluginInfo {
  return {
    version: hello.pluginVersion,
    bundleRevision: hello.bundleRevision || "unknown",
    protocolVersion: hello.protocolVersion,
    instanceId: hello.instanceId,
    clientId: hello.clientId,
    fileKey: hello.fileKey,
    fileName: hello.fileName,
    pageId: hello.pageId,
    pageName: hello.pageName,
    pages: Array.isArray(hello.pages) ? hello.pages.slice(0, 500) : [],
    editorType: hello.editorType,
    runtimeSdks: Array.isArray(hello.runtimeSdks) ? [...new Set(hello.runtimeSdks)].slice(0, 8) : [],
    ...(hello.features ? { features: hello.features } : {}),
    ...(hello.sync ? { sync: hello.sync } : {}),
    connectedAt,
  };
}

export function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{8,128}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= max && (allowEmpty || value.length > 0);
}

function isStringArray(value: unknown, maxItems = 100, maxChars = 1_000): value is string[] {
  return Array.isArray(value)
    && value.length <= maxItems
    && value.every((item) => boundedString(item, maxChars, true));
}

function isPluginHelloMessage(value: Record<string, unknown>): value is Record<string, unknown> & PluginHello {
  return value.type === "hello"
    && value.protocolVersion === PROTOCOL_VERSION
    && boundedString(value.pluginVersion, 128)
    && (value.bundleRevision === undefined || boundedString(value.bundleRevision, 64))
    && (value.runtimeSdks === undefined || isStringArray(value.runtimeSdks, 8, 32))
    && (value.features === undefined || isFeatureCapabilities(value.features))
    && (value.sync === undefined || isSyncState(value.sync))
    && validId(value.instanceId)
    && validId(value.clientId)
    && (value.fileKey === null || boundedString(value.fileKey, 512))
    && boundedString(value.fileName, 1_024, true)
    && boundedString(value.pageId, 256)
    && boundedString(value.pageName, 1_024, true)
    && Array.isArray(value.pages)
    && value.pages.length <= 500
    && value.pages.every((page) => isRecord(page)
      && boundedString(page.id, 256)
      && boundedString(page.name, 1_024, true))
    && boundedString(value.editorType, 64);
}

function isSyncState(value: unknown): value is SyncStateWire {
  if (!isRecord(value)) return false;
  return ["warming", "ready", "degraded_page_scope", "resync_required"].includes(String(value.state))
    && boundedString(value.syncEpoch, 128)
    && typeof value.changeSeq === "number" && Number.isInteger(value.changeSeq) && value.changeSeq >= 0
    && typeof value.unreadChanges === "number" && Number.isInteger(value.unreadChanges) && value.unreadChanges >= 0
    && isStringArray(value.subscribedPageIds, 500, 256)
    && (value.lastRescanAt === undefined || (typeof value.lastRescanAt === "number" && Number.isFinite(value.lastRescanAt)))
    && (value.lastError === undefined || boundedString(value.lastError, 8_192, true));
}

function isFeatureCapabilities(value: unknown): value is FeatureCapabilitiesWire {
  if (!isRecord(value)) return false;
  const queryKinds = value.queryKinds;
  const applyActions = value.applyActions;
  const sync = value.sync;
  const entityGraph = value.entityGraph;
  return isStringArray(queryKinds, 64, 128)
    && isStringArray(applyActions, 32, 128)
    && isRecord(sync)
    && typeof sync.documentChange === "boolean"
    && typeof sync.styleChange === "boolean"
    && typeof sync.variableFingerprint === "boolean"
    && typeof sync.maxJournalEntries === "number"
    && Number.isInteger(sync.maxJournalEntries)
    && sync.maxJournalEntries >= 0
    && isRecord(entityGraph)
    && typeof entityGraph.maxPatchOperations === "number"
    && Number.isInteger(entityGraph.maxPatchOperations)
    && entityGraph.maxPatchOperations >= 0
    && isStringArray(entityGraph.supportedEditors, 8, 64);
}

function isBridgeError(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.code === "string"
    && Object.values(ErrorCode).includes(value.code as ErrorCode)
    && boundedString(value.message, 8_192)
    && (value.hint === undefined || boundedString(value.hint, 8_192, true));
}

function isProgress(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.done === "number"
    && Number.isFinite(value.done)
    && value.done >= 0
    && typeof value.total === "number"
    && Number.isFinite(value.total)
    && value.total >= 0
    && (value.note === undefined || boundedString(value.note, 2_048, true));
}

function isBridgeResponsePayload(value: unknown): value is BridgeResponse {
  if (!isRecord(value) || !validId(value.id) || typeof value.ok !== "boolean") return false;
  if (value.warnings !== undefined && !isStringArray(value.warnings)) return false;
  if (value.progress !== undefined && !isProgress(value.progress)) return false;
  if (value.ok) return value.error === undefined;
  return isBridgeError(value.error) && value.result === undefined;
}

export function isClientWireMessage(value: unknown): value is WireMessage {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "hello":
      return isPluginHelloMessage(value);
    case "response":
      return isBridgeResponsePayload(value.payload);
    case "bind":
      return boundedString(value.sessionId, 256);
    case "telemetry_resync":
      return true;
    case "clear_queue":
    case "clear_request_log":
      return true;
    case "ping":
    case "pong":
      return typeof value.at === "number" && Number.isFinite(value.at) && value.at >= 0;
    default:
      return false;
  }
}

export function hasResult(res: BridgeResponse): boolean {
  return Object.prototype.hasOwnProperty.call(res, "result");
}

export function decodeBinaryFrame(data: RawData): { header: BinaryResponseHeader; bytes: Uint8Array } | null {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
  if (buffer.length < 4) return null;
  const headerLength = buffer.readUInt32BE(0);
  if (headerLength <= 0 || headerLength > MAX_BINARY_HEADER_BYTES || buffer.length < 4 + headerLength) return null;
  try {
    const header = JSON.parse(buffer.subarray(4, 4 + headerLength).toString("utf8")) as unknown;
    if (!isRecord(header)
      || header.type !== "binary_response"
      || header.ok !== true
      || !validId(header.id)
      || typeof header.format !== "string"
      || !(EXPORT_FORMATS as readonly string[]).includes(header.format)
      || typeof header.byteLength !== "number"
      || !Number.isInteger(header.byteLength)
      || header.byteLength < 0
      || header.byteLength > MAX_BINARY_ARTIFACT_BYTES
      || (header.metadata !== undefined && !isRecord(header.metadata))
      || (header.warnings !== undefined && !isStringArray(header.warnings))) return null;
    const payload = buffer.subarray(4 + headerLength);
    if (payload.byteLength !== header.byteLength) return null;
    return { header: header as unknown as BinaryResponseHeader, bytes: new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength) };
  } catch {
    return null;
  }
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    let bytes = 0;
    let settled = false;
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      if (settled) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > 1024 * 1024) {
        settled = true;
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(data);
    });
    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}
