import { RuntimeClient, assert, textPayload } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "figma-plugin-operation-smoke" });

try {
  await runtime.connect();
  const listed = await runtime.listTools();
  const names = listed.tools.map((tool) => tool.name);
  assert(JSON.stringify(names) === JSON.stringify(["figma_status", "figma_query", "figma_apply", "figma_exec", "figma_export"]), `Unexpected MCP tools: ${names.join(", ")}`);
  const execTool = listed.tools.find((tool) => tool.name === "figma_exec");
  const exportTool = listed.tools.find((tool) => tool.name === "figma_export");
  const queryTool = listed.tools.find((tool) => tool.name === "figma_query");
  const applyTool = listed.tools.find((tool) => tool.name === "figma_apply");
  const execProperties = execTool?.inputSchema?.properties ?? {};
  const operationSchema = execProperties.operation;
  const operationProperties = operationSchema?.properties ?? {};
  assert(Boolean(operationSchema), "figma_exec is missing operation schema.");
  assert(Boolean(exportTool?.inputSchema?.properties?.operation), "figma_export is missing operation schema.");
  assert(queryTool?.inputSchema?.properties?.kind?.enum?.includes("file_inventory"), "figma_query is missing file_inventory schema.");
  assert(applyTool?.inputSchema?.properties?.action?.enum?.includes("clear_file_owned_assets"), "figma_apply is missing clear_file_owned_assets schema.");
  assert(applyTool?.inputSchema?.properties?.action?.enum?.includes("import_library_asset"), "figma_apply is missing import_library_asset schema.");
  assert(queryTool?.inputSchema?.properties?.kind?.enum?.includes("library_inventory"), "figma_query is missing library_inventory schema.");
  assert(execProperties.runtimeSdk?.enum?.includes("v2"), "figma_exec is missing runtimeSdk v2 schema.");
  for (const field of ["planId", "stepId", "representation"]) {
    assert(Boolean(operationProperties[field]), `operation schema is missing ${field}.`);
  }

  const invalid = await runtime.callRaw("figma_exec", {
    code: "return 1;",
    operation: { label: "Missing trace identity", kind: "read" },
  });
  const invalidPayload = textPayload(invalid);
  assert(invalid.isError === true && invalidPayload.code === "INVALID_PARAMS", "Operation without traceId did not fail with INVALID_PARAMS.");
  const invalidPlan = await runtime.callRaw("figma_exec", {
    code: "return 1;",
    traceId: "smoke:invalid-plan",
    operation: { label: "Missing plan identity", kind: "read", stepId: "inspect" },
  });
  const invalidPlanPayload = textPayload(invalidPlan);
  assert(invalidPlan.isError === true && invalidPlanPayload.code === "INVALID_PARAMS", "Partial plan identity did not fail with INVALID_PARAMS.");

  const status = await runtime.status(true);
  const instances = Array.isArray(status.instances) ? status.instances : [];
  let liveRead = "SKIPPED";
  if (!process.argv.includes("--status-only")) {
    const allowStale = process.argv.includes("--allow-stale");
    const traceId = `smoke:operation-contract:${Date.now()}`;
    const readResult = await runtime.callRaw("figma_exec", {
      code: "const page = await figmaPlugin.loadPage(figma.currentPage); return { id: page.id, name: page.name, runtimeSdk: figmaPlugin.version };",
      runtimeSdk: "v2",
      ...(instances[0]?.instanceId ? { instanceId: instances[0].instanceId } : {}),
      capability: "figma-native",
      traceId,
      attempt: 1,
      operation: {
        label: "Read current page identity",
        kind: "read",
        phase: "inspect",
        planId: "mcp-operation-smoke",
        stepId: "read-current-page",
        representation: "table",
        target: instances[0]?.pageName || "Current Figma page",
        postconditions: ["Response contains current page id and name"],
      },
    });
    const readPayload = textPayload(readResult);
    if (instances.length === 0) {
      assert(readResult.isError === true && readPayload.code === "NOT_CONNECTED", "Disconnected runtime did not return NOT_CONNECTED.");
      liveRead = "NOT_CONNECTED";
    } else {
      if (readResult.isError === true && allowStale && readPayload.code === "UNSUPPORTED_OPERATION") {
        const after = await runtime.status(true);
        assert(after.queueLength === 0 && after.pendingCount === 0, "Stale companion rejection entered the runtime queue.");
        liveRead = "STALE_COMPANION_BLOCKED";
      } else {
        assert(readResult.isError !== true, `Connected read failed: ${JSON.stringify(readPayload)}`);
        assert(typeof readPayload.id === "string" && typeof readPayload.name === "string", "Connected read returned no page identity.");
        assert(readPayload.runtimeSdk === "v2", "Connected read did not execute through Runtime SDK v2.");
        liveRead = "SDK_READ_OK";
      }
    }
  }

  process.stdout.write(`${JSON.stringify({
    tools: names,
    operationSchema: true,
    planAwareOperationSchema: true,
    runtimeSdkSchema: "v2",
    invalidOperation: invalidPayload.code,
    invalidPlan: invalidPlanPayload.code,
    pluginConnected: status.pluginConnected,
    instanceCount: instances.length,
    queueLength: status.queueLength,
    pendingCount: status.pendingCount,
    instanceQueueLength: instances[0]?.queueLength ?? null,
    instanceInFlight: instances[0]?.inFlight ?? null,
    loadedRuntimeSdks: instances[0]?.runtimeSdks ?? [],
    statusHints: status.hints ?? [],
    liveRead,
  })}\n`);
} finally {
  await runtime.close();
}
