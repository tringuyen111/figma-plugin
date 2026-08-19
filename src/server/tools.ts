import { HEARTBEAT_DEAD_MS, PROTOCOL_VERSION, type InstanceSummaryWire, type OperationContextWire, type RuntimeSdkVersion } from "../shared/protocol.js";
import { BUNDLE_REVISION, VERSION } from "./version.js";
import { ErrorCode, OpError } from "./errors.js";
import type { SessionRegistry } from "./session.js";

export interface ToolContext {
  runValidated: (
    op: string,
    params: Record<string, unknown>,
    sessionId?: string,
    instanceId?: string,
    pageId?: string,
  ) => Promise<unknown>;
  sessions: SessionRegistry;
  diagnostics: () => Promise<Diagnostics>;
}

export interface Diagnostics {
  pluginConnected: boolean | null;
  statusSource: "leader" | "health" | "unknown";
  statusError?: string;
  mode: "leader" | "follower";
  port: number | null;
  bridgeAuth: "ready" | "missing";
  instances?: InstanceSummaryWire[];
  lastHeartbeatMs: number | null;
  queueLength: number;
  pendingCount: number;
  defaultSessionId?: string;
  boundInstanceId?: string;
}

export async function handleStatus(ctx: ToolContext, verbose = false): Promise<Record<string, unknown>> {
  const d = await ctx.diagnostics();
  const hints = buildHints(d);
  const instances = d.instances === undefined ? null : d.instances.map((i) => verbose ? i : ({
    instanceId: i.instanceId,
    fileName: i.fileName,
    pageId: i.pageId,
    pageName: i.pageName,
    editorType: i.editorType,
    bundleRevision: i.bundleRevision,
    runtimeSdks: i.runtimeSdks,
    queueLength: i.queueLength,
    metrics: {
      lastTotalMs: i.metrics.lastTotalMs,
      p95TotalMs: i.metrics.p95TotalMs,
      p95QueueMs: i.metrics.p95QueueMs,
      p95ExecutionMs: i.metrics.p95ExecutionMs,
      retryCount: i.metrics.retryCount,
      errorCount: i.metrics.errorCount,
    },
  }));

  return {
    pluginConnected: d.pluginConnected,
    statusSource: d.statusSource,
    ...(d.statusError ? { statusError: d.statusError } : {}),
    mode: d.mode,
    port: d.port,
    serverVersion: VERSION,
    protocolVersion: PROTOCOL_VERSION,
    bundleRevision: BUNDLE_REVISION,
    bridgeAuth: d.bridgeAuth,
    instances,
    queueLength: d.queueLength,
    pendingCount: d.pendingCount,
    lastHeartbeatMs: d.lastHeartbeatMs,
    routing: {
      sessionId: d.defaultSessionId ?? null,
      boundInstanceId: d.boundInstanceId ?? null,
    },
    ...(verbose ? { sessions: ctx.sessions.summaries() } : {}),
    hints,
  };
}

export async function handleExec(
  ctx: ToolContext,
  code: string,
  maxOutputChars?: number,
  sessionId?: string,
  instanceId?: string,
  pageId?: string,
  capability?: string,
  traceId?: string,
  attempt?: number,
  operation?: OperationContextWire,
  runtimeSdk?: RuntimeSdkVersion,
): Promise<unknown> {
  if (typeof code !== "string" || code.trim().length === 0) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "figma_exec requires non-empty `code`.", "Pass native Figma Plugin API JavaScript and return only compact evidence.");
  }
  return ctx.runValidated(
    "execute_js",
    {
      code,
      ...(maxOutputChars !== undefined ? { maxOutputChars } : {}),
      ...(capability ? { capability } : {}),
      ...(traceId ? { traceId } : {}),
      ...(attempt !== undefined ? { attempt } : {}),
      ...(operation ? { operation } : {}),
      ...(runtimeSdk ? { runtimeSdk } : {}),
    },
    sessionId,
    instanceId,
    pageId,
  );
}

export async function handleQuery(
  ctx: ToolContext,
  params: Record<string, unknown>,
  sessionId?: string,
  instanceId?: string,
  pageId?: string,
  capability?: string,
  traceId?: string,
  attempt?: number,
  operation?: OperationContextWire,
): Promise<unknown> {
  return ctx.runValidated(
    "query_document",
    {
      ...params,
      ...(capability ? { capability } : {}),
      ...(traceId ? { traceId } : {}),
      ...(attempt !== undefined ? { attempt } : {}),
      ...(operation ? { operation } : {}),
    },
    sessionId,
    instanceId,
    pageId,
  );
}

export async function handleApply(
  ctx: ToolContext,
  params: Record<string, unknown>,
  sessionId?: string,
  instanceId?: string,
  pageId?: string,
  capability?: string,
  traceId?: string,
  attempt?: number,
  operation?: OperationContextWire,
): Promise<unknown> {
  return ctx.runValidated(
    "apply_document",
    {
      ...params,
      ...(capability ? { capability } : {}),
      ...(traceId ? { traceId } : {}),
      ...(attempt !== undefined ? { attempt } : {}),
      ...(operation ? { operation } : {}),
    },
    sessionId,
    instanceId,
    pageId,
  );
}


export async function handleExport(
  ctx: ToolContext,
  params: Record<string, unknown>,
  filename?: string,
  sessionId?: string,
  instanceId?: string,
  pageId?: string,
): Promise<Record<string, unknown>> {
  // Internal __export__ makes the elected leader own artifact persistence so
  // follower processes receive only compact metadata, never base64 artifact bytes.
  return ctx.runValidated(
    "__export__",
    { exportParams: params, ...(filename ? { filename } : {}) },
    sessionId,
    instanceId,
    pageId,
  ) as Promise<Record<string, unknown>>;
}

function buildHints(d: Diagnostics): string[] {
  const hints: string[] = [];
  if (d.mode === "follower") hints.push("This MCP process is a follower; execution is forwarded to the local Figma Plugin leader.");
  if (d.pluginConnected === null) {
    hints.push("Figma connection state is unknown because the leader status probe failed. Retry figma_status or a bounded figma_exec call before asking the user to restart anything.");
  } else if (!d.pluginConnected) {
    hints.push("No Figma window is connected. Open Figma Plugin from Figma Desktop in the target window, then retry.");
  } else if ((d.instances?.length ?? 0) > 1 && !d.boundInstanceId) {
    hints.push(`${d.instances?.length} Figma windows are connected. Choose an instanceId from this status response, or bind this agent session in the target Figma Plugin window.`);
  } else if (d.boundInstanceId) {
    hints.push(`This agent session is bound to instance "${d.boundInstanceId}".`);
  }
  if (d.queueLength > 0) hints.push(`${d.queueLength} execution(s) are queued. Queue time counts against the total execution deadline.`);
  const staleSdkInstances = (d.instances ?? []).filter((instance) => !instance.runtimeSdks.includes("v2"));
  if (staleSdkInstances.length > 0) {
    hints.push(`${staleSdkInstances.length} connected Figma companion instance(s) do not advertise latest Runtime SDK v2. Reload Figma Plugin from the rebuilt development manifest before using runtimeSdk: "v2"; v1 remains available where advertised.`);
  }
  const staleBundleInstances = (d.instances ?? []).filter((instance) => instance.bundleRevision !== "unknown" && instance.bundleRevision !== BUNDLE_REVISION);
  if (staleBundleInstances.length > 0) {
    hints.push(`${staleBundleInstances.length} connected Figma companion instance(s) have a stale bundle revision. Reload the rebuilt development manifest before using Runtime SDK v2.`);
  }
  if (d.lastHeartbeatMs !== null && d.lastHeartbeatMs > HEARTBEAT_DEAD_MS) hints.push("The target Figma runtime has missed its heartbeat and may reconnect automatically.");
  if (!hints.length) hints.push("Ready. Use figma_exec with native Figma Plugin API JavaScript; specify pageId only when you intentionally target a page other than the window's current page.");
  return hints;
}
