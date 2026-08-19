/** Shared native ControlMux Figma bridge protocol. */
export const PROTOCOL_VERSION = 9;
export const DEFAULT_PORT = 38470;
export const PORT_RANGE = 10;

/** Maximum WebSocket frame accepted by the local bridge. */
export const MAX_BINARY_FRAME_BYTES = 64 * 1024 * 1024;
/** Reserve enough room for the JSON binary-response header inside that frame. */
export const MAX_BINARY_HEADER_BYTES = 64 * 1024;
/** Hard artifact payload ceiling after framing overhead is reserved. */
export const MAX_BINARY_ARTIFACT_BYTES = MAX_BINARY_FRAME_BYTES - MAX_BINARY_HEADER_BYTES - 4;
export const DEFAULT_MAX_EXPORT_BYTES = 32 * 1024 * 1024;

export const OPERATIONS = ["execute_js", "query_document", "apply_document", "export_node"] as const;
export type Operation = (typeof OPERATIONS)[number];
export const QUERY_KINDS = ["file_inventory", "node_handoff", "structure"] as const;
export type QueryKind = (typeof QUERY_KINDS)[number];
export const APPLY_ACTIONS = ["clear_file_owned_assets"] as const;
export type ApplyAction = (typeof APPLY_ACTIONS)[number];

export const EXPORT_FORMATS = ["PNG", "JPG", "SVG", "PDF", "JSON", "MP4", "GIF", "WEBM"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const REQUEST_KINDS = ["read", "write", "export", "other"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export type RequestStatus = "queued" | "running" | "success" | "failed" | "timeout" | "cancelled";

export const OPERATION_PHASES = ["inspect", "plan", "execute", "verify", "recover"] as const;
export type OperationPhase = (typeof OPERATION_PHASES)[number];
export const OPERATION_REPRESENTATIONS = ["text", "table", "flow", "timeline", "tree", "state-diagram", "typed-graph", "bar", "metric-cards", "wireframe", "component-specimen", "rendered-composition", "code", "artifact", "other"] as const;
export type OperationRepresentation = (typeof OPERATION_REPRESENTATIONS)[number];
export const RUNTIME_SDK_VERSIONS = ["v1", "v2"] as const;
export type RuntimeSdkVersion = (typeof RUNTIME_SDK_VERSIONS)[number];

export interface OperationContextWire {
  label: string;
  kind: RequestKind;
  phase?: OperationPhase;
  planId?: string;
  stepId?: string;
  representation?: OperationRepresentation;
  target?: string;
  postconditions?: string[];
}

export enum ErrorCode {
  NOT_CONNECTED = "NOT_CONNECTED",
  INVALID_PARAMS = "INVALID_PARAMS",
  PLUGIN_TIMEOUT = "PLUGIN_TIMEOUT",
  QUEUE_FULL = "QUEUE_FULL",
  CANCELLED = "CANCELLED",
  CONNECTION_LOST = "CONNECTION_LOST",
  UNAUTHORIZED = "UNAUTHORIZED",
  SANDBOX_ERROR = "SANDBOX_ERROR",
  UNSUPPORTED_OPERATION = "UNSUPPORTED_OPERATION",
  AMBIGUOUS_TARGET = "AMBIGUOUS_TARGET",
  TARGET_NOT_FOUND = "TARGET_NOT_FOUND",
  PAGE_NOT_FOUND = "PAGE_NOT_FOUND",
  OUTPUT_TOO_LARGE = "OUTPUT_TOO_LARGE",
  INTERNAL = "INTERNAL",
}

export interface BridgeError {
  code: ErrorCode;
  message: string;
  hint?: string;
}

export interface BridgeRequest {
  id: string;
  op: Operation;
  params: Record<string, unknown>;
  targetPageId?: string;
}

export interface BridgeResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: BridgeError;
  warnings?: string[];
  progress?: { done: number; total: number; note?: string };
}

export interface PageSummaryWire {
  id: string;
  name: string;
}

export interface PluginHello {
  type: "hello";
  protocolVersion: number;
  pluginVersion: string;
  /** Exact source/manifest revision injected into the loaded companion bundle. */
  bundleRevision?: string;
  /** Opt-in execution helper versions supported by this exact loaded companion bundle. */
  runtimeSdks?: string[];
  instanceId: string;
  clientId: string;
  fileKey: string | null;
  fileName: string;
  pageId: string;
  pageName: string;
  pages: PageSummaryWire[];
  editorType: "figma" | "figjam" | "slides" | string;
}

export interface InstanceAssigned {
  type: "assigned";
  instanceId: string;
}

export interface RequestKindCountsWire {
  read: number;
  write: number;
  export: number;
  other: number;
}

export interface RuntimeMetricsWire {
  /** Rolling latency sample count. */
  samples: number;
  /** Cumulative accepted request count since this plugin instance connected. */
  totalCount: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  cancelledCount: number;
  requestKinds: RequestKindCountsWire;
  lastTotalMs: number | null;
  p50TotalMs: number | null;
  p95TotalMs: number | null;
  lastQueueMs: number | null;
  p50QueueMs: number | null;
  p95QueueMs: number | null;
  lastExecutionMs: number | null;
  p95ExecutionMs: number | null;
  /** Cumulative non-cancel terminal errors (failed + timeout). */
  errorCount: number;
  /** Requests carrying a declared primary ControlMux Figma capability. */
  attributedCount: number;
  /** Requests explicitly marked as retry attempts (attempt > 1). */
  retryCount: number;
  /** Cumulative traffic since this plugin instance connected. */
  requestBytes: number;
  responseBytes: number;
}

export interface RequestEventWire {
  id: string;
  kind: RequestKind;
  label: string;
  status: RequestStatus;
  enqueuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  queueMs: number;
  executionMs?: number;
  totalMs?: number;
  requestBytes: number;
  responseBytes: number;
  errorCode?: ErrorCode | string;
  sessionId?: string;
  /** Optional primary Skill attribution supplied by the agent for measurement only. */
  capability?: string;
  /** Stable logical task/operation trace identifier supplied by the agent. */
  traceId?: string;
  /** 1-based attempt number for the same logical operation. */
  attempt?: number;
  /** Requested JSON result budget for this execution, when explicitly set. */
  outputBudgetChars?: number;
  /** Requested binary artifact transport budget for figma_export, when explicitly set. */
  artifactBudgetBytes?: number;
  /** Optional logical-operation phase supplied by the caller. */
  operationPhase?: OperationPhase;
  /** Optional durable plan identity; telemetry does not own canonical plan state. */
  operationPlanId?: string;
  /** Optional step identity inside operationPlanId. */
  operationStepId?: string;
  /** Caller-selected representation for the active reasoning/output shape. */
  operationRepresentation?: OperationRepresentation;
  /** Human-readable bounded target summary; routing still uses instanceId/pageId. */
  operationTarget?: string;
  /** Expected outcomes for observability only; execution does not auto-certify them. */
  postconditions?: string[];
}

export interface OperationSummaryWire {
  id: string;
  label: string;
  kind: RequestKind;
  status: RequestStatus;
  startedAt: number;
  finishedAt?: number;
  totalMs?: number;
  requestCount: number;
  attemptCount: number;
  requestIds: string[];
  capability?: string;
  phase?: OperationPhase;
  planId?: string;
  stepId?: string;
  representation?: OperationRepresentation;
  target?: string;
  postconditions?: string[];
  errorCode?: ErrorCode | string;
}

export interface InstanceTelemetryWire {
  metrics: RuntimeMetricsWire;
  requests: RequestEventWire[];
  operations: OperationSummaryWire[];
  historyLimit: number;
}

export interface RuntimeLoadWire {
  queueLength: number;
  pendingCount: number;
  inFlight: number;
}

export interface InstanceSummaryWire {
  instanceId: string;
  clientId: string;
  fileKey: string | null;
  fileName: string;
  pageId: string;
  pageName: string;
  pages?: PageSummaryWire[];
  editorType: string;
  bundleRevision: string;
  runtimeSdks: string[];
  queueLength: number;
  pendingCount: number;
  inFlight: number;
  lastHeartbeatMs: number;
  metrics: RuntimeMetricsWire;
}

export interface SessionSummaryWire {
  id: string;
  execCount: number;
  errorCount: number;
  lastActivityMs: number;
  boundInstanceId?: string | null;
}

export interface InstancesUpdate {
  type: "instances";
  self: string;
  instances: InstanceSummaryWire[];
  sessions: SessionSummaryWire[];
  /** Self-instance-only telemetry. Other windows' request logs are never broadcast. */
  telemetry?: InstanceTelemetryWire;
  /** Monotonic self-telemetry cursor. Present on full snapshots and state-only updates. */
  telemetrySeq?: number;
}

export interface TelemetryDelta {
  type: "telemetry_delta";
  self: string;
  seq: number;
  runtime: RuntimeLoadWire;
  metrics: RuntimeMetricsWire;
  historyLimit: number;
  /** Request records that are new or changed since the previous cursor. */
  requests?: RequestEventWire[];
  /** Operation records that are new or changed since the previous cursor. */
  operations?: OperationSummaryWire[];
  requestIdsRemoved?: string[];
  operationIdsRemoved?: string[];
  /** True when the bounded request history was explicitly cleared. */
  clearHistory?: boolean;
}

export interface TelemetryResyncRequest {
  type: "telemetry_resync";
}

export interface BindRequest {
  type: "bind";
  sessionId: string;
}

export interface ClearQueueRequest {
  type: "clear_queue";
}

export interface ClearRequestLogRequest {
  type: "clear_request_log";
}

export interface Heartbeat {
  type: "ping" | "pong";
  at: number;
}

export type WireMessage =
  | { type: "request"; payload: BridgeRequest }
  | { type: "response"; payload: BridgeResponse }
  | PluginHello
  | InstanceAssigned
  | InstancesUpdate
  | TelemetryDelta
  | TelemetryResyncRequest
  | BindRequest
  | ClearQueueRequest
  | ClearRequestLogRequest
  | Heartbeat;

export interface BinaryResponseHeader {
  type: "binary_response";
  id: string;
  ok: true;
  format: ExportFormat;
  byteLength: number;
  metadata?: Record<string, unknown>;
  warnings?: string[];
}

export const HEARTBEAT_INTERVAL_MS = 10_000;
export const HEARTBEAT_DEAD_MS = 30_000;
export const DEFAULT_OP_TIMEOUT_MS = 120_000;
export const OP_TIMEOUTS: Partial<Record<Operation, number>> = {
  execute_js: 120_000,
  query_document: 120_000,
  apply_document: 300_000,
  export_node: 300_000,
};
export const EXPORT_RPC_GRACE_MS = 15_000;
export const EXPORT_RPC_TIMEOUT_MS = (OP_TIMEOUTS.export_node ?? 300_000) + EXPORT_RPC_GRACE_MS;

export interface LeaderInfo {
  port: number;
  token: string;
  pid: number;
  startedAt: number;
  version: string;
}
