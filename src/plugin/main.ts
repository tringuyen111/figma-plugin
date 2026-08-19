/// <reference types="@figma/plugin-typings" />
import {
  ErrorCode,
  PROTOCOL_VERSION,
  type BridgeRequest,
  type BridgeResponse,
  type PageSummaryWire,
} from "../shared/protocol.js";
import { executeJs, PluginExecError, type BinaryExecResult } from "./handlers/execute-js.js";
import { exportNode, type ExportBinaryResult } from "./handlers/export-node.js";
import { applyDocument, queryDocument } from "./handlers/document-operations.js";
import { FIGMA_RUNTIME_SDK_VERSIONS } from "./runtime-sdk.js";

declare const __VERSION__: string;
declare const __BUNDLE_REVISION__: string;
const PLUGIN_VERSION = typeof __VERSION__ === "string" ? __VERSION__ : "0.0.0-dev";
const PLUGIN_BUNDLE_REVISION = typeof __BUNDLE_REVISION__ === "string" ? __BUNDLE_REVISION__ : "dev";
const CLIENT_ID_KEY = "controlmux-figma:client-id";
const MAX_PAGE_SUMMARIES = 500;
const INSTANCE_ID = newId("instance");
const UI_WIDTH = 390;
const UI_INITIAL_HEIGHT = 720;
const UI_MIN_HEIGHT = 620;
const UI_MAX_HEIGHT = 820;

interface HelloData {
  protocolVersion: number;
  pluginVersion: string;
  bundleRevision: string;
  runtimeSdks: string[];
  instanceId: string;
  clientId: string;
  fileKey: string | null;
  fileName: string;
  pageId: string;
  pageName: string;
  pages: PageSummaryWire[];
  editorType: string;
}

type UiToMain =
  | { kind: "handshake" }
  | { kind: "hello-request" }
  | { kind: "request"; payload: BridgeRequest }
  | { kind: "switch-page"; pageId: string }
  | { kind: "resize"; height: number };

type MainToUi =
  | { kind: "handshake"; pluginVersion: string; protocolVersion: number }
  | { kind: "hello"; hello: HelloData }
  | { kind: "response"; payload: BridgeResponse }
  | { kind: "binary-response"; id: string; format: BinaryExecResult["format"] | ExportBinaryResult["format"]; bytes: Uint8Array; metadata: Record<string, unknown>; warnings?: string[] };

let clientId = "";
const clientReady = loadClientId();

function post(msg: MainToUi): void {
  figma.ui.postMessage(msg);
}

async function loadClientId(): Promise<void> {
  try {
    const existing = await figma.clientStorage.getAsync(CLIENT_ID_KEY);
    if (typeof existing === "string" && existing.length >= 8) {
      clientId = existing;
      return;
    }
    clientId = newId("client");
    await figma.clientStorage.setAsync(CLIENT_ID_KEY, clientId);
  } catch {
    clientId = newId("client");
  }
}

function newId(prefix: string): string {
  const rnd = () => Math.floor(Math.random() * 0x100000000).toString(36).padStart(6, "0");
  return `${prefix}-${Date.now().toString(36)}-${rnd()}${rnd()}`;
}

function pages(): PageSummaryWire[] {
  return figma.root.children
    .filter((node): node is PageNode => node.type === "PAGE")
    .slice(0, MAX_PAGE_SUMMARIES)
    .map((page) => ({ id: page.id, name: page.name }));
}

async function helloData(): Promise<HelloData> {
  await clientReady;
  return {
    protocolVersion: PROTOCOL_VERSION,
    pluginVersion: PLUGIN_VERSION,
    bundleRevision: PLUGIN_BUNDLE_REVISION,
    runtimeSdks: [...FIGMA_RUNTIME_SDK_VERSIONS],
    instanceId: INSTANCE_ID,
    clientId,
    fileKey: (figma as unknown as { fileKey?: string }).fileKey ?? null,
    fileName: figma.root.name,
    pageId: figma.currentPage.id,
    pageName: figma.currentPage.name,
    pages: pages(),
    editorType: figma.editorType,
  };
}

async function switchPage(pageId: string): Promise<void> {
  if (!pageId || pageId === figma.currentPage.id) return;
  const node = await figma.getNodeByIdAsync(pageId);
  if (!node || node.type !== "PAGE") {
    throw new PluginExecError({
      code: ErrorCode.PAGE_NOT_FOUND,
      message: `Page "${pageId}" was not found in this Figma file.`,
      hint: "Call figma_status again and choose a current page id from the target instance.",
    });
  }
  await figma.setCurrentPageAsync(node);
}

async function dispatch(req: BridgeRequest): Promise<void> {
  try {
    if (req.targetPageId) await switchPage(req.targetPageId);
    let result: unknown;
    if (req.op === "execute_js") result = await executeJs(req.params ?? {});
    else if (req.op === "query_document") result = await queryDocument(req.params ?? {});
    else if (req.op === "apply_document") result = await applyDocument(req.params ?? {});
    else if (req.op === "export_node") result = await exportNode(req.params ?? {});
    else throw new PluginExecError({ code: ErrorCode.UNSUPPORTED_OPERATION, message: `Unsupported operation "${String(req.op)}".` });
    if (isBinary(result)) {
      post({ kind: "binary-response", id: req.id, format: result.format, bytes: result.bytes, metadata: result.metadata });
    } else {
      post({ kind: "response", payload: { id: req.id, ok: true, result } });
    }
    if (req.targetPageId) post({ kind: "hello", hello: await helloData() });
  } catch (cause) {
    const error = cause instanceof PluginExecError
      ? cause.bridgeError
      : { code: ErrorCode.INTERNAL, message: cause instanceof Error ? cause.message : String(cause) };
    post({ kind: "response", payload: { id: req.id, ok: false, error } });
  }
}

function isBinary(value: unknown): value is BinaryExecResult | ExportBinaryResult {
  return !!value && typeof value === "object" && (value as { kind?: unknown }).kind === "binary";
}

figma.showUI(__html__, { visible: true, width: UI_WIDTH, height: UI_INITIAL_HEIGHT });

figma.ui.onmessage = async (msg: UiToMain) => {
  if (!msg || typeof msg !== "object") return;
  switch (msg.kind) {
    case "handshake":
      await clientReady;
      post({ kind: "handshake", pluginVersion: PLUGIN_VERSION, protocolVersion: PROTOCOL_VERSION });
      post({ kind: "hello", hello: await helloData() });
      break;
    case "hello-request":
      post({ kind: "hello", hello: await helloData() });
      break;
    case "switch-page":
      try {
        await switchPage(msg.pageId);
        post({ kind: "hello", hello: await helloData() });
      } catch {
        post({ kind: "hello", hello: await helloData() });
      }
      break;
    case "resize": {
      if (!Number.isFinite(msg.height)) break;
      const height = Math.max(UI_MIN_HEIGHT, Math.min(UI_MAX_HEIGHT, Math.round(msg.height)));
      figma.ui.resize(UI_WIDTH, height);
      break;
    }
    case "request":
      await dispatch(msg.payload);
      break;
  }
};

figma.on("currentpagechange", () => {
  void helloData().then((hello) => post({ kind: "hello", hello }));
});
