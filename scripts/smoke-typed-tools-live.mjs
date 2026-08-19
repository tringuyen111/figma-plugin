import { RuntimeClient, assert } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "typed-tools-live-smoke" });
const traceRoot = `typed-tools-live:${Date.now()}`;

try {
  await runtime.connect();
  const status = await runtime.status(true);
  const instance = runtime.resolveSingleInstance(status);
  assert(instance.bundleRevision === status.bundleRevision, `Companion bundle ${instance.bundleRevision} does not match server ${status.bundleRevision}.`);

  const query = await runtime.call("figma_query", {
    kind: "file_inventory",
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-native",
    traceId: `${traceRoot}:query`,
    operation: {
      label: "Inventory current Figma file",
      kind: "read",
      phase: "inspect",
      planId: "typed-tools-live",
      stepId: "file-inventory",
      representation: "table",
      target: `${instance.fileName} / all pages`,
      postconditions: ["Inventory returns page and file-owned asset counts"],
    },
  });
  assert(Array.isArray(query.pages), "figma_query did not return pages.");

  const applyPlan = await runtime.call("figma_apply", {
    action: "clear_file_owned_assets",
    dryRun: true,
    removeLocalAssets: true,
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-native",
    traceId: `${traceRoot}:apply-plan`,
    operation: {
      label: "Plan file-owned cleanup without mutation",
      kind: "write",
      phase: "plan",
      planId: "typed-tools-live",
      stepId: "clear-dry-run",
      representation: "table",
      target: `${instance.fileName} / all pages`,
      postconditions: ["Dry-run returns a mutation plan and does not alter Figma"],
    },
  });
  assert(applyPlan.dryRun === true && applyPlan.plan?.removeLocalAssets === true, "figma_apply did not return the guarded dry-run plan.");

  const after = await runtime.status(true);
  const afterInstance = after.instances?.find((candidate) => candidate.instanceId === instance.instanceId);
  assert(after.queueLength === 0 && after.pendingCount === 0 && afterInstance?.inFlight === 0, "Typed-tool smoke did not return to idle.");
  process.stdout.write(`${JSON.stringify({
    tools: ["figma_status", "figma_query", "figma_apply", "figma_exec", "figma_export"],
    bundleRevision: instance.bundleRevision,
    query: { pages: query.pages.length, components: query.components, localStyles: query.localStyles, variables: query.variables },
    applyPlan: { dryRun: applyPlan.dryRun, pages: applyPlan.plan.pages.length, removeLocalAssets: applyPlan.plan.removeLocalAssets },
    finalState: { queueLength: after.queueLength, pendingCount: after.pendingCount, instanceInFlight: afterInstance.inFlight },
    verdict: "PASS",
  })}\n`);
} finally {
  await runtime.close();
}
