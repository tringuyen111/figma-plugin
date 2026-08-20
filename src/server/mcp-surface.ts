import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { VERSION } from "./version.js";
import { APPLY_ACTIONS, LIBRARY_ASSET_TYPES, MAX_BINARY_ARTIFACT_BYTES, OPERATION_PHASES, OPERATION_REPRESENTATIONS, QUERY_KINDS, REQUEST_KINDS, RUNTIME_SDK_VERSIONS, type OperationContextWire, type RequestKind, type RuntimeSdkVersion } from "../shared/protocol.js";
import { FIGMA_SKILL_IDS } from "../capabilities/skill-registry.js";
import { ErrorCode, OpError, toBridgeError } from "./errors.js";
import { handleApply, handleExec, handleExport, handleQuery, handleStatus, type ToolContext } from "./tools.js";
import { validateOperationContext } from "./operation-context.js";

const OPERATION_SCHEMA = {
  type: "object",
  description: "Optional logical-operation context for grouping retries/phases and showing accountable intent. Requires traceId. Postconditions are observability expectations, not automatic PASS claims.",
  properties: {
    label: { type: "string", minLength: 1, maxLength: 96, description: "Concise user-facing objective shared by every request in this logical operation." },
    kind: { type: "string", enum: [...REQUEST_KINDS], description: "Caller-declared semantic request kind. The runtime does not guess JavaScript intent." },
    phase: { type: "string", enum: [...OPERATION_PHASES], description: "Current operation phase." },
    planId: { type: "string", minLength: 1, maxLength: 128, description: "Optional durable work-plan identity. Requires stepId; telemetry does not own plan state." },
    stepId: { type: "string", minLength: 1, maxLength: 128, description: "Optional active step identity inside planId. Requires planId." },
    representation: { type: "string", enum: [...OPERATION_REPRESENTATIONS], description: "Representation chosen for the active reasoning/output shape." },
    target: { type: "string", minLength: 1, maxLength: 160, description: "Bounded human-readable target summary. Routing still uses instanceId/pageId and code-level node IDs." },
    postconditions: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string", minLength: 1, maxLength: 160 },
      description: "Expected outcomes for later evidence collection. Supplying them does not verify them.",
    },
  },
  required: ["label", "kind"],
  additionalProperties: false,
} as const;

const STATUS_TOOL: Tool = {
  name: "figma_status",
  description: "Inspect Figma Plugin runtime state: connected Figma windows, current file/page targets, routing, queue depth, latency/error health, and bridge role. Use it when target or connection state is ambiguous.",
  inputSchema: {
    type: "object",
    properties: { verbose: { type: "boolean", description: "Include full per-instance metrics, page lists, and local session diagnostics." } },
    additionalProperties: false,
  },
};

const EXEC_TOOL: Tool = {
  name: "figma_exec",
  description: "Execute plain JavaScript against the native Figma Plugin API inside one connected Figma window. Use the installed Figma Skills for design/layout/system reasoning; this tool is the low-level execution kernel. With multiple windows, pass instanceId or bind the agent session in the Figma plugin UI. Optionally pass pageId to target a specific page deterministically. PNG/JPEG Uint8Array exports use binary bridge transport and become MCP image content.",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", minLength: 1, maxLength: 50000, description: "Native Figma Plugin API JavaScript body. Top-level await and return are supported." },
      runtimeSdk: { type: "string", enum: [...RUNTIME_SDK_VERSIONS], description: "Optional provider-mechanical helpers exposed as `figmaPlugin`. v2 adds targeted page loading, complete style/variable binding, handoff inspection, and undo checkpoints; v1 remains compatible." },
      maxOutputChars: { type: "number", minimum: 1, maximum: 100000, description: "JSON response budget. Default 12000, hard max 100000." },
      sessionId: { type: "string", minLength: 1, maxLength: 256, description: "Optional stable agent session id. Omit to use this MCP process's private session." },
      instanceId: { type: "string", minLength: 1, maxLength: 256, description: "Target connected Figma plugin instance/window. Required when routing is ambiguous unless the session is bound in the plugin UI." },
      pageId: { type: "string", minLength: 1, maxLength: 256, description: "Optional page id inside the target instance. The plugin switches to that page before executing." },
      capability: { type: "string", enum: [...FIGMA_SKILL_IDS], description: "Optional primary Figma Plugin Skill attribution for performance/eval telemetry only. It does not change execution behavior." },
      traceId: { type: "string", minLength: 1, maxLength: 128, description: "Optional stable logical-operation trace id for correlating tightly related calls. Reuse it across retries of the same operation." },
      attempt: { type: "integer", minimum: 1, maximum: 1000, description: "Optional 1-based attempt number for the same logical operation. Use >1 only for retries, not normal sequential steps." },
      operation: OPERATION_SCHEMA,
    },
    required: ["code"],
    additionalProperties: false,
  },
};


const EXPORT_TOOL: Tool = {
  name: "figma_export",
  description: "Export one Figma node through the local ControlMux bridge and persist the bytes as a local artifact instead of putting large binary payloads in model context. Supports PNG, JPG, SVG, PDF, REST-shaped JSON, MP4, GIF, and WEBM when the target/editor supports that format. Video formats require an animated top-level frame.",
  inputSchema: {
    type: "object",
    properties: {
      nodeId: { type: "string", minLength: 1, maxLength: 256, description: "Exact node id to export." },
      format: { type: "string", enum: ["PNG", "JPG", "SVG", "PDF", "JSON", "MP4", "GIF", "WEBM"] },
      constraint: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["SCALE", "WIDTH", "HEIGHT"] },
          value: { type: "number", exclusiveMinimum: 0 },
        },
        required: ["type", "value"],
        additionalProperties: false,
      },
      contentsOnly: { type: "boolean", description: "Export only the node contents, excluding overlapping sibling content. Applies to image/SVG/PDF exports when supported." },
      useAbsoluteBounds: { type: "boolean", description: "Use full node bounds rather than cropped rendered bounds when supported." },
      colorProfile: { type: "string", enum: ["DOCUMENT", "SRGB", "DISPLAY_P3_V4"] },
      svgOutlineText: { type: "boolean" },
      svgIdAttribute: { type: "boolean" },
      svgSimplifyStroke: { type: "boolean" },
      fps: { type: "integer", minimum: 1, maximum: 60, description: "Video/GIF frame rate. Exact allowed values depend on format." },
      quality: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"], description: "MP4/WEBM quality preset." },
      loopCount: { type: "integer", minimum: 0, maximum: 1000, description: "GIF loop count; 0 means infinite." },
      maxBytes: { type: "integer", minimum: 1, maximum: MAX_BINARY_ARTIFACT_BYTES, description: "Artifact payload ceiling after WebSocket framing overhead is reserved. Default 32 MiB." },
      filename: { type: "string", minLength: 1, maxLength: 180, description: "Optional output basename only. ControlMux chooses the correct extension and export directory." },
      sessionId: { type: "string", minLength: 1, maxLength: 256 },
      instanceId: { type: "string", minLength: 1, maxLength: 256 },
      pageId: { type: "string", minLength: 1, maxLength: 256 },
      capability: { type: "string", enum: [...FIGMA_SKILL_IDS], description: "Optional calling Skill attribution for telemetry only." },
      traceId: { type: "string", minLength: 1, maxLength: 128 },
      attempt: { type: "integer", minimum: 1, maximum: 1000 },
      operation: OPERATION_SCHEMA,
    },
    required: ["nodeId", "format"],
    additionalProperties: false,
  },
};

const QUERY_TOOL: Tool = {
  name: "figma_query",
  description: "Run an enforceable read-only query against the native Figma Plugin API. Use library_inventory for component/style/variable identity, publish status, enabled library-variable descriptors, and the explicit publish/enable boundary; use the other kinds for file, structure, and code-handoff evidence.",
  inputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: [...QUERY_KINDS], description: "Typed read query to execute." },
      nodeId: { type: "string", minLength: 1, maxLength: 256, description: "Required for node_handoff and structure." },
      includeChildren: { type: "boolean", description: "Include descendant Dev Resources for node_handoff." },
      sessionId: { type: "string", minLength: 1, maxLength: 256 },
      instanceId: { type: "string", minLength: 1, maxLength: 256 },
      pageId: { type: "string", minLength: 1, maxLength: 256 },
      capability: { type: "string", enum: [...FIGMA_SKILL_IDS] },
      traceId: { type: "string", minLength: 1, maxLength: 128 },
      attempt: { type: "integer", minimum: 1, maximum: 1000 },
      operation: OPERATION_SCHEMA,
    },
    required: ["kind"],
    additionalProperties: false,
  },
};

const APPLY_TOOL: Tool = {
  name: "figma_apply",
  description: "Run a bounded, serialized Figma mutation with dry-run, explicit confirmation, undo checkpoint, and postcondition evidence. Supports importing published components, component sets, styles, and variables by exact key; publication and library enablement remain provider/UI authority. dryRun defaults to true.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: [...APPLY_ACTIONS], description: "Typed mutation recipe." },
      dryRun: { type: "boolean", description: "Plan and inspect without changing Figma. Defaults to true." },
      confirm: { type: "boolean", description: "Required true for a non-dry-run destructive action." },
      pageIds: { type: "array", maxItems: 100, items: { type: "string", minLength: 1, maxLength: 256 }, description: "Optional exact pages to clear; omit for all pages." },
      removeLocalAssets: { type: "boolean", description: "For clear_file_owned_assets, also remove local styles and variable collections." },
      assetType: { type: "string", enum: [...LIBRARY_ASSET_TYPES], description: "For import_library_asset, exact published asset kind." },
      key: { type: "string", minLength: 1, maxLength: 256, description: "For import_library_asset, exact published component/component-set/style/variable key. Local unpublished keys are rejected by Figma." },
      instanceName: { type: "string", minLength: 1, maxLength: 180, description: "For component imports, target instance name used for idempotency." },
      x: { type: "number", minimum: -1000000, maximum: 1000000, description: "For component imports, target X coordinate." },
      y: { type: "number", minimum: -1000000, maximum: 1000000, description: "For component imports, target Y coordinate." },
      propertyValues: { type: "object", additionalProperties: { type: ["string", "boolean"] }, description: "For component imports, exact Figma component property keys including # suffixes for TEXT/BOOLEAN/INSTANCE_SWAP properties." },
      sessionId: { type: "string", minLength: 1, maxLength: 256 },
      instanceId: { type: "string", minLength: 1, maxLength: 256 },
      pageId: { type: "string", minLength: 1, maxLength: 256 },
      capability: { type: "string", enum: [...FIGMA_SKILL_IDS] },
      traceId: { type: "string", minLength: 1, maxLength: 128 },
      attempt: { type: "integer", minimum: 1, maximum: 1000 },
      operation: OPERATION_SCHEMA,
    },
    required: ["action"],
    additionalProperties: false,
  },
};

export function toolDefinitions(): Tool[] {
  return [STATUS_TOOL, QUERY_TOOL, APPLY_TOOL, EXEC_TOOL, EXPORT_TOOL];
}

export function createMcpServer(ctx: ToolContext): Server {
  const server = new Server({ name: "figma-plugin", version: VERSION }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions() }));
  server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
    const { name, arguments: args = {} } = req.params;
    try {
      const result = await callTool(ctx, name, args as Record<string, unknown>);
      return toToolResult(result);
    } catch (err) {
      return toToolError(err);
    }
  });
  return server;
}

async function callTool(ctx: ToolContext, name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === "figma_status") return handleStatus(ctx, args["verbose"] === true);
  if (name === "figma_exec") {
    const traceId = optionalTraceId(args["traceId"]);
    const operation = optionalOperation(args["operation"], traceId);
    const runtimeSdk = optionalRuntimeSdk(args["runtimeSdk"]);
    return handleExec(
      ctx,
      typeof args["code"] === "string" ? args["code"] : "",
      args["maxOutputChars"] as number | undefined,
      optionalId(args["sessionId"], "sessionId"),
      optionalId(args["instanceId"], "instanceId"),
      optionalId(args["pageId"], "pageId"),
      optionalCapability(args["capability"]),
      traceId,
      optionalAttempt(args["attempt"]),
      operation,
      runtimeSdk,
    );
  }
  if (name === "figma_query") {
    const traceId = optionalTraceId(args["traceId"]);
    const operation = optionalOperation(args["operation"], traceId, "read");
    const params: Record<string, unknown> = {};
    for (const key of ["kind", "nodeId", "includeChildren"]) if (args[key] !== undefined) params[key] = args[key];
    return handleQuery(
      ctx,
      params,
      optionalId(args["sessionId"], "sessionId"),
      optionalId(args["instanceId"], "instanceId"),
      optionalId(args["pageId"], "pageId"),
      optionalCapability(args["capability"]),
      traceId,
      optionalAttempt(args["attempt"]),
      operation,
    );
  }
  if (name === "figma_apply") {
    const traceId = optionalTraceId(args["traceId"]);
    const operation = optionalOperation(args["operation"], traceId, "write");
    const params: Record<string, unknown> = {};
    for (const key of ["action", "dryRun", "confirm", "pageIds", "removeLocalAssets", "assetType", "key", "instanceName", "x", "y", "propertyValues"]) if (args[key] !== undefined) params[key] = args[key];
    return handleApply(
      ctx,
      params,
      optionalId(args["sessionId"], "sessionId"),
      optionalId(args["instanceId"], "instanceId"),
      optionalId(args["pageId"], "pageId"),
      optionalCapability(args["capability"]),
      traceId,
      optionalAttempt(args["attempt"]),
      operation,
    );
  }
  if (name === "figma_export") {
    const params: Record<string, unknown> = {};
    for (const key of ["nodeId", "format", "constraint", "contentsOnly", "useAbsoluteBounds", "colorProfile", "svgOutlineText", "svgIdAttribute", "svgSimplifyStroke", "fps", "quality", "loopCount", "maxBytes", "capability", "traceId", "attempt"]) {
      if (args[key] !== undefined) params[key] = args[key];
    }
    const traceId = optionalTraceId(args["traceId"]);
    const operation = optionalOperation(args["operation"], traceId, "export");
    if (operation) params["operation"] = operation;
    return handleExport(
      ctx,
      params,
      optionalFilename(args["filename"]),
      optionalId(args["sessionId"], "sessionId"),
      optionalId(args["instanceId"], "instanceId"),
      optionalId(args["pageId"], "pageId"),
    );
  }
  throw new OpError(ErrorCode.INVALID_PARAMS, `Unknown tool "${name}".`, "Available tools: figma_status, figma_query, figma_apply, figma_exec, figma_export.");
}

function optionalOperation(value: unknown, traceId: string | undefined, expectedKind?: RequestKind): OperationContextWire | undefined {
  return validateOperationContext(value, traceId, expectedKind);
}

function optionalRuntimeSdk(value: unknown): RuntimeSdkVersion | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !RUNTIME_SDK_VERSIONS.includes(value as RuntimeSdkVersion)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `runtimeSdk must be one of: ${RUNTIME_SDK_VERSIONS.join(", ")}.`);
  }
  return value as RuntimeSdkVersion;
}


function optionalFilename(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 180 || /[\u0000-\u001f]/.test(value)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "filename must be a non-empty basename up to 180 characters.");
  }
  return value;
}

function optionalId(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || /[\u0000-\u001f]/.test(value)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `${label} must be a non-empty string up to 256 characters.`);
  }
  return value;
}

function optionalCapability(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !(FIGMA_SKILL_IDS as readonly string[]).includes(value)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `capability must be one of: ${FIGMA_SKILL_IDS.join(", ")}.`);
  }
  return value;
}

function optionalTraceId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "traceId must be 1-128 characters using letters, numbers, dot, underscore, colon, or hyphen.");
  }
  return value;
}

function optionalAttempt(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 1000) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "attempt must be an integer from 1 to 1000.");
  }
  return value;
}

const IMAGE_MIME: Record<string, string> = { PNG: "image/png", JPG: "image/jpeg", JPEG: "image/jpeg" };

function imageResult(result: unknown): CallToolResult | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const format = typeof r["format"] === "string" ? String(r["format"]).toUpperCase() : "";
  const mime = IMAGE_MIME[format];
  if (!mime) return null;
  const bytes = r["bytes"];
  let base64: string | null = null;
  if (bytes instanceof Uint8Array) base64 = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  else if (typeof r["base64"] === "string" && r["base64"]) base64 = r["base64"] as string;
  if (!base64) return null;
  const meta: Record<string, unknown> = { format };
  for (const [key, value] of Object.entries(r)) {
    if (key === "bytes" || key === "base64" || key === "format") continue;
    meta[key] = value;
  }
  return { content: [{ type: "text", text: JSON.stringify(meta) }, { type: "image", data: base64, mimeType: mime }] };
}

function artifactResult(result: unknown): CallToolResult | null {
  if (!result || typeof result !== "object") return null;
  const outer = result as Record<string, unknown>;
  const artifact = outer["artifact"];
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return null;
  const record = artifact as Record<string, unknown>;
  const uri = typeof record["uri"] === "string" ? record["uri"] : "";
  const name = typeof record["filename"] === "string" ? record["filename"] : "Figma export";
  const mimeType = typeof record["mimeType"] === "string" ? record["mimeType"] : undefined;
  const size = typeof record["byteLength"] === "number" && Number.isFinite(record["byteLength"]) ? record["byteLength"] : undefined;
  if (!uri) return null;
  const descriptor = { ...outer, artifact: { ...record } };
  return {
    content: [
      { type: "text", text: JSON.stringify(descriptor) },
      { type: "resource_link", uri, name, ...(mimeType ? { mimeType } : {}), ...(size !== undefined ? { size } : {}) },
    ],
    structuredContent: descriptor,
  };
}

export function toToolResult(result: unknown): CallToolResult {
  const artifact = artifactResult(result);
  if (artifact) return artifact;
  const image = imageResult(result);
  if (image) return image;
  if (result && typeof result === "object" && "result" in result && "warnings" in result) {
    const inner = imageResult((result as { result: unknown }).result);
    if (inner) {
      inner.content.unshift({ type: "text", text: JSON.stringify({ warnings: (result as { warnings: unknown }).warnings }) });
      return inner;
    }
  }
  return { content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }] };
}

function toToolError(err: unknown): CallToolResult {
  const error = toBridgeError(err);
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ code: error.code, message: error.message, hint: error.hint }) }] };
}
