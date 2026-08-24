import { randomUUID } from "node:crypto";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { APPLY_ACTIONS, DEFAULT_PORT, ENTITY_KINDS, EXPORT_RPC_TIMEOUT_MS, LIBRARY_ASSET_TYPES, MAX_BINARY_ARTIFACT_BYTES, PORT_RANGE, QUERY_KINDS, RUNTIME_SDK_VERSIONS, type BridgeResponse, type Operation, type RuntimeSdkVersion } from "../shared/protocol.js";
import type { Bridge } from "./bridge.js";
import { ErrorCode, OpError } from "./errors.js";
import { Follower, STATUS_RPC_TIMEOUT_MS } from "./follower.js";
import { Coordinator } from "./leader.js";
import { createMcpServer } from "./mcp-surface.js";
import { SessionRegistry } from "./session.js";
import { isFigmaSkillId } from "../capabilities/skill-registry.js";
import { validateOperationContext } from "./operation-context.js";
import type { Diagnostics, ToolContext } from "./tools.js";
import { persistExportArtifact } from "./export-artifacts.js";
import { validateConflictPolicy, validateEntityPatches } from "../shared/entity-contract.js";

export function resolveStartPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env["CONTROLMUX_FIGMA_PORT"];
  if (raw === undefined || raw.trim() === "") return DEFAULT_PORT;
  const port = Number(raw);
  const maxPort = DEFAULT_PORT + PORT_RANGE - 1;
  if (!Number.isInteger(port) || port < DEFAULT_PORT || port > maxPort) {
    throw new Error(`CONTROLMUX_FIGMA_PORT must be an integer between ${DEFAULT_PORT} and ${maxPort} (got "${raw}").`);
  }
  return port;
}

export interface ServerHandle {
  server: Server;
  coordinator: Coordinator;
  diagnostics: () => Promise<Diagnostics>;
  close: () => Promise<void>;
}

export async function createServer(): Promise<ServerHandle> {
  const sessions = new SessionRegistry();
  const defaultSessionId = `agent-${randomUUID().slice(0, 8)}`;
  sessions.get(defaultSessionId);

  let coordinator!: Coordinator;
  const liveBridge = (): Bridge | undefined => coordinator.bridge;

  const runValidated = async (
    op: string,
    params: Record<string, unknown>,
    sessionId?: string,
    instanceId?: string,
    pageId?: string,
  ): Promise<unknown> => {
    const sid = sessionId && sessionId.length ? sessionId : defaultSessionId;

    if (op === "__register__") {
      sessions.get(sid);
      liveBridge()?.refreshState();
      return { registered: true };
    }
    if (op === "__status__") {
      const bridge = liveBridge();
      if (!bridge) throw new OpError(ErrorCode.NOT_CONNECTED, "Leader bridge is unavailable.");
      return leaderState(bridge, sid);
    }
    if (op === "__export__") {
      const { exportParams, filename } = validateExportEnvelope(params);
      if (coordinator.role === "follower") {
        return coordinator.forward("__export__", params, sid, instanceId, pageId, EXPORT_RPC_TIMEOUT_MS);
      }
      const bridge = liveBridge();
      if (!bridge) throw new OpError(ErrorCode.NOT_CONNECTED, "Figma Plugin bridge is unavailable.");
      try {
        const response = await bridge.dispatch("export_node", exportParams, {
          sessionId: sid,
          ...(instanceId ? { instanceId } : {}),
          ...(pageId ? { pageId } : {}),
        });
        sessions.recordExecution(sid, response.ok);
        bridge.refreshState();
        const artifactPayload = unwrap(response);
        const persisted = await persistExportArtifact(artifactPayload, filename);
        const warnings = response.warnings?.length ? response.warnings : undefined;
        return { ...persisted, ...(warnings ? { warnings } : {}) };
      } catch (err) {
        sessions.recordExecution(sid, false);
        bridge.refreshState();
        throw err;
      }
    }
    if (op === "execute_js") validateExecParams(params);
    else if (op === "query_document") validateQueryParams(params);
    else if (op === "apply_document") validateApplyParams(params);
    else if (op === "export_node") validateExportParams(params);
    else throw new OpError(ErrorCode.UNSUPPORTED_OPERATION, `Unsupported operation "${op}".`);

    if (coordinator.role === "follower") {
      return coordinator.forward(op, params, sid, instanceId, pageId);
    }

    const bridge = liveBridge();
    if (!bridge) throw new OpError(ErrorCode.NOT_CONNECTED, "Figma Plugin bridge is unavailable.");
    try {
      const response = await bridge.dispatch(op as Operation, params, {
        sessionId: sid,
        ...(instanceId ? { instanceId } : {}),
        ...(pageId ? { pageId } : {}),
      });
      sessions.recordExecution(sid, response.ok);
      bridge.refreshState();
      return unwrap(response);
    } catch (err) {
      sessions.recordExecution(sid, false);
      bridge.refreshState();
      throw err;
    }
  };

  coordinator = new Coordinator({
    startPort: resolveStartPort(),
    runValidated,
    onBridgeCreated: (bridge) => {
      bridge.setSessionsProvider(() => sessions.summaries());
      bridge.refreshState();
    },
  });

  const diagnostics = async (): Promise<Diagnostics> => {
    const info = coordinator.info();
    const base = {
      mode: coordinator.role,
      port: info?.port ?? null,
      bridgeAuth: info?.token ? "ready" as const : "missing" as const,
      defaultSessionId,
    };

    if (coordinator.role === "leader") {
      const bridge = liveBridge();
      if (!bridge) {
        return { ...base, statusSource: "unknown", pluginConnected: null, lastHeartbeatMs: null, queueLength: 0, pendingCount: 0 };
      }
      const state = leaderState(bridge, defaultSessionId);
      return { ...base, statusSource: "leader", ...state };
    }

    try {
      const state = await coordinator.forward("__status__", {}, defaultSessionId, undefined, undefined, STATUS_RPC_TIMEOUT_MS) as LeaderState;
      return { ...base, statusSource: "leader", ...state };
    } catch (err) {
      const port = info?.port;
      const health = port && info?.token ? await Follower.fetchHealth(port, STATUS_RPC_TIMEOUT_MS, info.token) : undefined;
      if (health) {
        return {
          ...base,
          statusSource: "health",
          pluginConnected: health.pluginConnected ?? false,
          instances: health.instances ?? [],
          lastHeartbeatMs: health.lastHeartbeatMs ?? null,
          queueLength: health.queueLength ?? 0,
          pendingCount: health.pendingCount ?? 0,
        };
      }
      return {
        ...base,
        statusSource: "unknown",
        statusError: err instanceof Error ? err.message : String(err),
        pluginConnected: null,
        lastHeartbeatMs: null,
        queueLength: 0,
        pendingCount: 0,
      };
    }
  };

  const ctx: ToolContext = { runValidated, sessions, diagnostics };
  await coordinator.start();
  if (coordinator.role === "follower") void coordinator.forward("__register__", {}, defaultSessionId).catch(() => {});

  return {
    server: createMcpServer(ctx),
    coordinator,
    diagnostics,
    close: async () => { sessions.close(); await coordinator.close(); },
  };
}

type LeaderState = Pick<Diagnostics, "pluginConnected" | "instances" | "lastHeartbeatMs" | "queueLength" | "pendingCount" | "boundInstanceId">;

function leaderState(bridge: Bridge, sessionId: string): LeaderState {
  return {
    pluginConnected: bridge.pluginConnected,
    instances: bridge.instanceSummaries(),
    lastHeartbeatMs: bridge.lastHeartbeatMs,
    queueLength: bridge.queueLength,
    pendingCount: bridge.pendingCount,
    ...(bridge.sessionBinding(sessionId) ? { boundInstanceId: bridge.sessionBinding(sessionId) } : {}),
  };
}

function validateExecParams(params: Record<string, unknown>): void {
  const code = params["code"];
  if (typeof code !== "string" || !code.trim() || code.length > 50_000) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "figma_exec code must be a non-empty string up to 50000 characters.");
  }
  const budget = params["maxOutputChars"];
  if (budget !== undefined && (typeof budget !== "number" || !Number.isInteger(budget) || budget <= 0 || budget > 100_000)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "maxOutputChars must be an integer from 1 to 100000.");
  }
  if (params["runtimeSdk"] !== undefined && (typeof params["runtimeSdk"] !== "string" || !RUNTIME_SDK_VERSIONS.includes(params["runtimeSdk"] as RuntimeSdkVersion))) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `runtimeSdk must be one of: ${RUNTIME_SDK_VERSIONS.join(", ")}.`);
  }
  validateAttributionParams(params);
}

function validateQueryParams(params: Record<string, unknown>): void {
  const kind = params["kind"];
  if (typeof kind !== "string" || !QUERY_KINDS.includes(kind as (typeof QUERY_KINDS)[number])) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `query kind must be one of: ${QUERY_KINDS.join(", ")}.`);
  }
  if ((kind === "node_handoff" || kind === "structure") && (typeof params["nodeId"] !== "string" || !params["nodeId"])) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `${kind} requires a non-empty nodeId.`);
  }
  if (params["includeChildren"] !== undefined && typeof params["includeChildren"] !== "boolean") {
    throw new OpError(ErrorCode.INVALID_PARAMS, "includeChildren must be boolean.");
  }
  if (params["limit"] !== undefined && (typeof params["limit"] !== "number" || !Number.isInteger(params["limit"]) || params["limit"] < 1 || params["limit"] > 1000)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "limit must be an integer from 1 to 1000.");
  }
  if (params["cursor"] !== undefined && (typeof params["cursor"] !== "string" || params["cursor"].length === 0 || params["cursor"].length > 256)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "cursor must be a non-empty string up to 256 characters.");
  }
  if (params["entityKind"] !== undefined && (typeof params["entityKind"] !== "string" || !ENTITY_KINDS.includes(params["entityKind"] as (typeof ENTITY_KINDS)[number]))) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `entityKind must be one of: ${ENTITY_KINDS.join(", ")}.`);
  }
}

function validateApplyParams(params: Record<string, unknown>): void {
  const action = params["action"];
  if (typeof action !== "string" || !APPLY_ACTIONS.includes(action as (typeof APPLY_ACTIONS)[number])) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `apply action must be one of: ${APPLY_ACTIONS.join(", ")}.`);
  }
  if (params["dryRun"] !== undefined && typeof params["dryRun"] !== "boolean") throw new OpError(ErrorCode.INVALID_PARAMS, "dryRun must be boolean.");
  if (params["confirm"] !== undefined && typeof params["confirm"] !== "boolean") throw new OpError(ErrorCode.INVALID_PARAMS, "confirm must be boolean.");
  if (params["expectedPlanHash"] !== undefined && (typeof params["expectedPlanHash"] !== "string" || params["expectedPlanHash"].length === 0 || params["expectedPlanHash"].length > 128)) throw new OpError(ErrorCode.INVALID_PARAMS, "expectedPlanHash must be a non-empty string up to 128 characters.");
  if (params["conflictPolicy"] !== undefined) {
    try { validateConflictPolicy(params["conflictPolicy"]); } catch (error) { throw new OpError(ErrorCode.INVALID_PARAMS, error instanceof Error ? error.message : String(error)); }
  }
  if (params["allowDelete"] !== undefined && typeof params["allowDelete"] !== "boolean") throw new OpError(ErrorCode.INVALID_PARAMS, "allowDelete must be boolean.");
  if (params["maxOperations"] !== undefined && (typeof params["maxOperations"] !== "number" || !Number.isInteger(params["maxOperations"]) || params["maxOperations"] < 1 || params["maxOperations"] > 100)) throw new OpError(ErrorCode.INVALID_PARAMS, "maxOperations must be an integer from 1 to 100.");
  if (params["removeLocalAssets"] !== undefined && typeof params["removeLocalAssets"] !== "boolean") throw new OpError(ErrorCode.INVALID_PARAMS, "removeLocalAssets must be boolean.");
  const pageIds = params["pageIds"];
  if (pageIds !== undefined && (!Array.isArray(pageIds) || pageIds.length > 100 || !pageIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 256))) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "pageIds must be an array of 1-100 non-empty page ids.");
  }
  if (action === "import_library_asset") {
    const assetType = params["assetType"];
    if (typeof assetType !== "string" || !LIBRARY_ASSET_TYPES.includes(assetType as (typeof LIBRARY_ASSET_TYPES)[number])) {
      throw new OpError(ErrorCode.INVALID_PARAMS, `import_library_asset assetType must be one of: ${LIBRARY_ASSET_TYPES.join(", ")}.`);
    }
    const key = params["key"];
    if (typeof key !== "string" || key.trim().length === 0 || key.length > 256 || /[\u0000-\u001f]/.test(key)) {
      throw new OpError(ErrorCode.INVALID_PARAMS, "import_library_asset key must be a non-empty string up to 256 characters.");
    }
    const instanceName = params["instanceName"];
    if (instanceName !== undefined && (typeof instanceName !== "string" || instanceName.trim().length === 0 || instanceName.length > 180 || /[\u0000-\u001f]/.test(instanceName))) {
      throw new OpError(ErrorCode.INVALID_PARAMS, "instanceName must be a non-empty string up to 180 characters.");
    }
    for (const coordinate of ["x", "y"]) {
      const value = params[coordinate];
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < -1_000_000 || value > 1_000_000)) {
        throw new OpError(ErrorCode.INVALID_PARAMS, `${coordinate} must be a finite number between -1000000 and 1000000.`);
      }
    }
    const propertyValues = params["propertyValues"];
    if (propertyValues !== undefined && (!propertyValues || typeof propertyValues !== "object" || Array.isArray(propertyValues) || !Object.entries(propertyValues).every(([name, value]) => Boolean(name) && (typeof value === "string" || typeof value === "boolean")))) {
      throw new OpError(ErrorCode.INVALID_PARAMS, "propertyValues must be an object of exact Figma property keys to string/boolean values.");
    }
  }
  if (action === "apply_entity_patch") {
    try { validateEntityPatches(params["patches"], typeof params["maxOperations"] === "number" ? params["maxOperations"] : 100); } catch (error) {
      throw new OpError(ErrorCode.INVALID_PARAMS, error instanceof Error ? error.message : String(error));
    }
  }
}

function validateExportEnvelope(params: Record<string, unknown>): { exportParams: Record<string, unknown>; filename?: string } {
  const exportParams = params["exportParams"];
  if (!exportParams || typeof exportParams !== "object" || Array.isArray(exportParams)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "Internal export envelope requires exportParams.");
  }
  const normalized = exportParams as Record<string, unknown>;
  validateExportParams(normalized);
  const filename = params["filename"];
  if (filename !== undefined && (typeof filename !== "string" || filename.trim().length === 0 || filename.length > 180 || /[\u0000-\u001f]/.test(filename))) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "filename must be a non-empty basename up to 180 characters.");
  }
  return { exportParams: normalized, ...(typeof filename === "string" ? { filename } : {}) };
}

function validateExportParams(params: Record<string, unknown>): void {
  const nodeId = params["nodeId"];
  if (typeof nodeId !== "string" || nodeId.length === 0 || nodeId.length > 256 || /[\u0000-\u001f]/.test(nodeId)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "figma_export nodeId must be a non-empty string up to 256 characters.");
  }
  const format = params["format"];
  if (typeof format !== "string" || !["PNG", "JPG", "SVG", "PDF", "JSON", "MP4", "GIF", "WEBM"].includes(format.toUpperCase())) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "figma_export format must be PNG, JPG, SVG, PDF, JSON, MP4, GIF, or WEBM.");
  }
  const maxBytes = params["maxBytes"];
  if (maxBytes !== undefined && (typeof maxBytes !== "number" || !Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_BINARY_ARTIFACT_BYTES)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `maxBytes must be an integer from 1 to ${MAX_BINARY_ARTIFACT_BYTES}.`);
  }
  validateAttributionParams(params, "export");
}

function validateAttributionParams(params: Record<string, unknown>, expectedKind?: "export"): void {
  const capability = params["capability"];
  if (capability !== undefined && !isFigmaSkillId(capability)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "capability must be a canonical Figma Plugin Skill id.");
  }
  const traceId = params["traceId"];
  if (traceId !== undefined && (typeof traceId !== "string" || traceId.length === 0 || traceId.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(traceId))) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "traceId must be 1-128 characters using letters, numbers, dot, underscore, colon, or hyphen.");
  }
  const attempt = params["attempt"];
  if (attempt !== undefined && (typeof attempt !== "number" || !Number.isInteger(attempt) || attempt < 1 || attempt > 1000)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "attempt must be an integer from 1 to 1000.");
  }
  validateOperationContext(params["operation"], traceId, expectedKind);
}

function unwrap(res: BridgeResponse): unknown {
  if (!res.ok) {
    const error = res.error ?? { code: ErrorCode.INTERNAL, message: "Operation failed with no error detail." };
    throw new OpError(error.code, error.message, error.hint);
  }
  return res.warnings?.length ? { result: res.result, warnings: res.warnings } : res.result;
}
