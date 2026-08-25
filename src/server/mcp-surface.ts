import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { VERSION } from "./version.js";
import { APPLY_ACTIONS, LIBRARY_ASSET_TYPES, MAX_BINARY_ARTIFACT_BYTES, OPERATION_PHASES, OPERATION_REPRESENTATIONS, PATCH_CONFLICT_POLICIES, PATCH_OPERATION_KINDS, QUERY_KINDS, REQUEST_KINDS, RUNTIME_SDK_VERSIONS, type OperationContextWire, type RequestKind, type RuntimeSdkVersion } from "../shared/protocol.js";
import { FIGMA_SKILL_IDS } from "../capabilities/skill-registry.js";
import { ErrorCode, OpError, mcpErrorDisposition, toBridgeError } from "./errors.js";
import { handleApply, handleExec, handleExport, handleQuery, handleStatus, type ToolContext } from "./tools.js";
import { validateOperationContext } from "./operation-context.js";

const OPERATION_SCHEMA = {
  type: "object",
  description: "Required accountable operation context for mutation-capable tools. Requires traceId. Postconditions are expectations for later evidence collection, never automatic PASS claims.",
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
  allOf: [{
    if: { properties: { kind: { enum: ["write", "export", "other"] } }, required: ["kind"] },
    then: { required: ["postconditions"] },
  }],
  additionalProperties: false,
} as const;

const EXEC_OPERATION_SCHEMA = {
  ...OPERATION_SCHEMA,
  description: "Required accountable operation context for raw native execution. Because arbitrary JavaScript cannot be proven read-only before execution, postconditions are always required regardless of caller-declared kind.",
  required: ["label", "kind", "postconditions"],
} as const;

function operationSchemaFor(kind: RequestKind, description: string, requirePostconditions: boolean) {
  return {
    ...OPERATION_SCHEMA,
    description,
    properties: {
      ...OPERATION_SCHEMA.properties,
      kind: { type: "string", enum: [kind], description: `This tool requires operation.kind=${kind}.` },
    },
    required: requirePostconditions ? ["label", "kind", "postconditions"] : ["label", "kind"],
  } as const;
}

const QUERY_OPERATION_SCHEMA = operationSchemaFor("read", "Optional read-operation context for typed Figma queries.", false);
const APPLY_OPERATION_SCHEMA = operationSchemaFor("write", "Required write-operation context with postconditions for guarded Figma mutations.", true);
const EXPORT_OPERATION_SCHEMA = operationSchemaFor("export", "Required export-operation context with postconditions for persisted artifact egress.", true);

const MCP_CONTRACT_SCHEMA_VERSION = 2;
const ENTITY_REF_SCHEMA = {
  type: "object",
  properties: {
    opRef: { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$", description: "Transaction-local identity produced by create/clone or another explicitly typed producer such as component_command:create_slot or component_command:combine_variants in the same apply_entity_patch transaction. It is resolved internally and never replaces the persistent id/controlId returned after commit." },
    controlId: { type: "string", minLength: 1, maxLength: 128 },
    nodeId: { type: "string", minLength: 1, maxLength: 256 },
    styleId: { type: "string", minLength: 1, maxLength: 256 },
    variableId: { type: "string", minLength: 1, maxLength: 256 },
    collectionId: { type: "string", minLength: 1, maxLength: 256 },
    expectedType: { type: "string", minLength: 1, maxLength: 128 },
  },
  minProperties: 1,
  additionalProperties: false,
} as const;
const ENTITY_PATCH_SCHEMA = {
  type: "object",
  required: ["kind", "entityKind"],
  properties: {
    kind: { type: "string", enum: [...PATCH_OPERATION_KINDS] },
    entityKind: { type: "string", enum: ["node", "style", "variable", "variable_collection"] },
    opRef: { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$", description: "Optional transaction-local output identity. Create/clone and explicitly typed producer commands such as component_command:create_slot or component_command:combine_variants may declare it; later modeled identity edges in the same patch list may consume it." },
    target: ENTITY_REF_SCHEMA,
    members: { type: "array", minItems: 1, maxItems: 64, items: ENTITY_REF_SCHEMA, description: "Modeled multi-identity input edge used by component_command:combine_variants. Member opRefs participate in the transaction dependency graph; arbitrary payload references are not resolved." },
    parent: ENTITY_REF_SCHEMA,
    collection: { ...ENTITY_REF_SCHEMA, description: "Modeled owning variable-collection identity for create entityKind=variable. A collection opRef participates in the transaction dependency graph; do not also provide properties.collectionId." },
    alias: { ...ENTITY_REF_SCHEMA, description: "Modeled source-variable identity for variable_command:set_value aliasing. An alias opRef participates in the transaction dependency graph; use exactly one of alias or payload.value." },
    variable: { ...ENTITY_REF_SCHEMA, description: "Modeled consumer-variable identity for set_bindings. A variable opRef participates in the transaction dependency graph; omit it only when payload.binding.unbind=true." },
    controlId: { type: "string", minLength: 1, maxLength: 128 },
    index: { type: "integer", minimum: 0 },
    entityType: { type: "string", minLength: 1, maxLength: 128 },
    properties: { type: "object", additionalProperties: true },
    set: { type: "object", additionalProperties: true },
    unset: { type: "array", items: { type: "string", minLength: 1, maxLength: 256 } },
    precondition: { type: "object", additionalProperties: true },
    command: { type: "string", minLength: 1, maxLength: 128 },
    payload: { type: "object", additionalProperties: true },
    allowDelete: { type: "boolean" },
  },
  additionalProperties: false,
} as const;
const MCP_SERVER_INSTRUCTIONS = [
  "Call figma_status before target-dependent work and whenever connection or routing is ambiguous.",
  "Prefer figma_query for enforceable reads and figma_apply for typed guarded mutations.",
  "figma_exec is a low-level mutation-capable escape hatch; it requires traceId and operation context.",
  "figma_apply and figma_export also require traceId and operation context.",
  "Postconditions describe evidence still to collect and never certify PASS by themselves.",
  "After a timeout or connection loss, inspect status and postconditions before retrying because a mutation may have committed.",
].join(" ");

function toolOutputSchema(toolName: string): NonNullable<Tool["outputSchema"]> {
  return {
    type: "object",
    properties: {
      schemaVersion: { type: "integer", const: MCP_CONTRACT_SCHEMA_VERSION },
      tool: { type: "string", const: toolName },
      status: { type: "string", enum: ["success", "error"] },
      result: {},
      error: {
        type: "object",
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          hint: { type: "string" },
          retryable: { type: "boolean" },
          retryAfterMs: { type: "integer", minimum: 0 },
          possiblyCommitted: { type: "boolean" },
          providerStateUnknown: { type: "boolean" },
        },
        required: ["code", "message", "retryable", "possiblyCommitted", "providerStateUnknown"],
        additionalProperties: false,
      },
    },
    required: ["schemaVersion", "tool", "status"],
    oneOf: [
      {
        properties: { status: { const: "success" } },
        required: ["result"],
      },
      {
        properties: { status: { const: "error" } },
        required: ["error"],
      },
    ],
    additionalProperties: true,
  } as NonNullable<Tool["outputSchema"]>;
}

const STATUS_TOOL: Tool = {
  name: "figma_status",
  description: "Inspect Figma Plugin runtime state: connected Figma windows, current file/page targets, routing, queue depth, latency/error health, and bridge role. Use it when target or connection state is ambiguous.",
  annotations: { title: "Inspect Figma runtime", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: {
    type: "object",
    properties: { verbose: { type: "boolean", description: "Include full per-instance metrics, page lists, and local session diagnostics." } },
    additionalProperties: false,
  },
  outputSchema: toolOutputSchema("figma_status"),
};

const EXEC_TOOL: Tool = {
  name: "figma_exec",
  description: "Execute plain JavaScript against the native Figma Plugin API inside one connected Figma window. This is a mutation-capable low-level escape hatch; prefer typed query/apply tools. traceId and operation are required so intent, retries, target, and expected evidence remain inspectable.",
  annotations: { title: "Execute native Figma code", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
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
      traceId: { type: "string", minLength: 1, maxLength: 128, description: "Required stable logical-operation trace id. Reuse it across retries of the same operation." },
      attempt: { type: "integer", minimum: 1, maximum: 1000, description: "Optional 1-based attempt number for the same logical operation. Use >1 only for retries, not normal sequential steps." },
      operation: EXEC_OPERATION_SCHEMA,
    },
    required: ["code", "traceId", "operation"],
    additionalProperties: false,
  },
  outputSchema: toolOutputSchema("figma_exec"),
};


const EXPORT_TOOL: Tool = {
  name: "figma_export",
  description: "Export one Figma node through the local ControlMux bridge and persist the bytes as a local artifact instead of putting large binary payloads in model context. Supports PNG, JPG, SVG, PDF, REST-shaped JSON, MP4, GIF, and WEBM when the target/editor supports that format. Video formats require an animated top-level frame.",
  annotations: { title: "Export Figma artifact", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
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
      operation: EXPORT_OPERATION_SCHEMA,
    },
    required: ["nodeId", "format", "traceId", "operation"],
    additionalProperties: false,
  },
  outputSchema: toolOutputSchema("figma_export"),
};

const QUERY_TOOL: Tool = {
  name: "figma_query",
  description: "Run an enforceable read-only query against the native Figma Plugin API. Typed graph, change-feed, binding, prototype, motion and accessibility facts never issue a verdict; figma-verification owns claim evaluation.",
  annotations: { title: "Query Figma", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: [...QUERY_KINDS], description: "Typed read query to execute." },
      nodeId: { type: "string", minLength: 1, maxLength: 256, description: "Required for node_handoff and structure." },
      includeChildren: { type: "boolean", description: "Include descendant Dev Resources for node_handoff." },
      logicalId: { type: "string", minLength: 1, maxLength: 256, description: "Optional stable controlId for entity_graph/change_feed targeting." },
      entityKind: { type: "string", enum: ["node", "style", "variable", "variable_collection"], description: "Optional entity graph filter." },
      scope: { type: "string", enum: ["document", "page", "node", "styles", "variables"] },
      projection: { type: "array", maxItems: 32, items: { type: "string", minLength: 1, maxLength: 64 } },
      cursor: { type: "string", minLength: 1, maxLength: 256 },
      limit: { type: "integer", minimum: 1, maximum: 1000 },
      refresh: { type: "boolean", description: "Rescan the managed target before returning facts." },
      sessionId: { type: "string", minLength: 1, maxLength: 256 },
      instanceId: { type: "string", minLength: 1, maxLength: 256 },
      pageId: { type: "string", minLength: 1, maxLength: 256 },
      capability: { type: "string", enum: [...FIGMA_SKILL_IDS] },
      traceId: { type: "string", minLength: 1, maxLength: 128 },
      attempt: { type: "integer", minimum: 1, maximum: 1000 },
      operation: QUERY_OPERATION_SCHEMA,
    },
    required: ["kind"],
    additionalProperties: false,
  },
  outputSchema: toolOutputSchema("figma_query"),
};

const APPLY_TOOL: Tool = {
  name: "figma_apply",
  description: "Run a bounded, serialized Figma mutation with dry-run, optimistic preconditions, typed readback, undo/rollback and postcondition evidence. apply_entity_patch provides typed CRUD; publication and library enablement remain provider/UI authority.",
  annotations: { title: "Apply guarded Figma mutation", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
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
      patches: { type: "array", minItems: 1, maxItems: 100, items: ENTITY_PATCH_SCHEMA, description: `Typed entity patches. Supported kinds: ${PATCH_OPERATION_KINDS.join(", ")}.` },
      expectedPlanHash: { type: "string", minLength: 1, maxLength: 128 },
      conflictPolicy: { type: "string", enum: [...PATCH_CONFLICT_POLICIES] },
      allowDelete: { type: "boolean" },
      maxOperations: { type: "integer", minimum: 1, maximum: 100 },
      resultMode: { type: "string", enum: ["full", "receipt"], description: "For apply_entity_patch commits, full preserves the legacy result; receipt returns compact identity/conflict/rollback evidence. Dry-run planning remains full." },
      sessionId: { type: "string", minLength: 1, maxLength: 256 },
      instanceId: { type: "string", minLength: 1, maxLength: 256 },
      pageId: { type: "string", minLength: 1, maxLength: 256 },
      capability: { type: "string", enum: [...FIGMA_SKILL_IDS] },
      traceId: { type: "string", minLength: 1, maxLength: 128 },
      attempt: { type: "integer", minimum: 1, maximum: 1000 },
      operation: APPLY_OPERATION_SCHEMA,
    },
    required: ["action", "traceId", "operation"],
    additionalProperties: false,
  },
  outputSchema: toolOutputSchema("figma_apply"),
};

export function toolDefinitions(): Tool[] {
  return [STATUS_TOOL, QUERY_TOOL, APPLY_TOOL, EXEC_TOOL, EXPORT_TOOL];
}

export function createMcpServer(ctx: ToolContext): Server {
  const server = new Server(
    { name: "figma-plugin", version: VERSION },
    { capabilities: { tools: {} }, instructions: MCP_SERVER_INSTRUCTIONS },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions() }));
  server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
    const { name, arguments: args = {} } = req.params;
    try {
      const result = await callTool(ctx, name, args as Record<string, unknown>);
      return toToolResult(result, name);
    } catch (err) {
      return toToolError(err, name);
    }
  });
  return server;
}

async function callTool(ctx: ToolContext, name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === "figma_status") return handleStatus(ctx, args["verbose"] === true);
  if (name === "figma_exec") {
    const traceId = requiredTraceId(args["traceId"], name);
    const operation = requiredOperation(args["operation"], traceId, name, undefined, true);
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
    const pageId = optionalId(args["pageId"], "pageId");
    const params: Record<string, unknown> = {};
    for (const key of ["kind", "nodeId", "includeChildren", "logicalId", "entityKind", "scope", "projection", "cursor", "limit", "refresh"]) if (args[key] !== undefined) params[key] = args[key];
    if (pageId) params["pageId"] = pageId;
    return handleQuery(
      ctx,
      params,
      optionalId(args["sessionId"], "sessionId"),
      optionalId(args["instanceId"], "instanceId"),
      pageId,
      optionalCapability(args["capability"]),
      traceId,
      optionalAttempt(args["attempt"]),
      operation,
    );
  }
  if (name === "figma_apply") {
    const traceId = requiredTraceId(args["traceId"], name);
    const operation = requiredOperation(args["operation"], traceId, name, "write");
    const params: Record<string, unknown> = {};
    for (const key of ["action", "dryRun", "confirm", "pageIds", "removeLocalAssets", "assetType", "key", "instanceName", "x", "y", "propertyValues", "patches", "expectedPlanHash", "conflictPolicy", "allowDelete", "maxOperations", "resultMode"]) if (args[key] !== undefined) params[key] = args[key];
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
    const traceId = requiredTraceId(args["traceId"], name);
    const operation = requiredOperation(args["operation"], traceId, name, "export");
    params["operation"] = operation;
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

function requiredOperation(
  value: unknown,
  traceId: string,
  toolName: string,
  expectedKind?: RequestKind,
  alwaysRequirePostconditions = false,
): OperationContextWire {
  const operation = validateOperationContext(value, traceId, expectedKind);
  if (!operation) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `${toolName} requires operation context so intent and evidence obligations cannot be omitted.`);
  }
  if ((alwaysRequirePostconditions || operation.kind !== "read") && (!operation.postconditions || operation.postconditions.length === 0)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `${toolName} requires operation.postconditions for mutation/export intent. Postconditions remain unverified until read back.`);
  }
  return operation;
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

function requiredTraceId(value: unknown, toolName: string): string {
  const traceId = optionalTraceId(value);
  if (!traceId) throw new OpError(ErrorCode.INVALID_PARAMS, `${toolName} requires traceId.`);
  return traceId;
}

function optionalAttempt(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 1000) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "attempt must be an integer from 1 to 1000.");
  }
  return value;
}

const IMAGE_MIME: Record<string, string> = { PNG: "image/png", JPG: "image/jpeg", JPEG: "image/jpeg" };

function structuredSuccess(toolName: string, result: unknown): Record<string, unknown> {
  return {
    schemaVersion: MCP_CONTRACT_SCHEMA_VERSION,
    tool: toolName,
    status: "success",
    result: result === undefined ? null : result,
  };
}

function imageResult(result: unknown, toolName: string, warnings?: unknown): CallToolResult | null {
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
  const structuredResult = warnings === undefined ? meta : { ...meta, warnings };
  return {
    content: [{ type: "text", text: JSON.stringify(meta) }, { type: "image", data: base64, mimeType: mime }],
    structuredContent: structuredSuccess(toolName, structuredResult),
  };
}

function artifactResult(result: unknown, toolName: string): CallToolResult | null {
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
    structuredContent: { ...descriptor, ...structuredSuccess(toolName, descriptor) },
  };
}

export function toToolResult(result: unknown, toolName = "figma_unknown"): CallToolResult {
  const artifact = artifactResult(result, toolName);
  if (artifact) return artifact;
  const image = imageResult(result, toolName);
  if (image) return image;
  if (result && typeof result === "object" && "result" in result && "warnings" in result) {
    const inner = imageResult(
      (result as { result: unknown }).result,
      toolName,
      (result as { warnings: unknown }).warnings,
    );
    if (inner) {
      inner.content.unshift({ type: "text", text: JSON.stringify({ warnings: (result as { warnings: unknown }).warnings }) });
      return inner;
    }
  }
  return {
    content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }],
    structuredContent: structuredSuccess(toolName, result),
  };
}

export function toToolError(err: unknown, toolName = "figma_unknown"): CallToolResult {
  const error = toBridgeError(err);
  const disposition = mcpErrorDisposition(error.code, toolName);
  const payload = { code: error.code, message: error.message, hint: error.hint, ...disposition };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: {
      schemaVersion: MCP_CONTRACT_SCHEMA_VERSION,
      tool: toolName,
      status: "error",
      error: payload,
    },
  };
}
